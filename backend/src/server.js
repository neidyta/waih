require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');
const { requireAuth, requireRole } = require('./auth');
const { reglas: r, validar } = require('./validar');

const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(express.json());

const bad = (res, errores) => res.status(400).json({ error: 'Revisa los campos marcados.', campos: errores });
const admin = [requireAuth, requireRole('admin')];
const handle = fn => (req, res) => fn(req, res).catch(e => {
  if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ya existe un registro con ese dato (cédula, placa o número de recibo).' });
  if (e.code === 'ER_ROW_IS_REFERENCED_2') return res.status(409).json({ error: 'No se puede eliminar: tiene recibos asociados.' });
  if (e.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ error: 'El conductor o la placa indicada no existe.' });
  console.error(e); res.status(500).json({ error: 'Error interno del servidor.' });
});

/* ---------- RF-01 / RF-08: autenticación ---------- */
app.post('/api/auth/login', handle(async (req, res) => {
  const { cedula, contrasena } = req.body;
  const [[u]] = await db.query('SELECT * FROM usuarios WHERE cedula = ?', [cedula]);
  const generico = { error: 'Cédula o contraseña incorrecta.' };
  if (!u) return res.status(401).json(generico);

  // RNF-03: bloqueo 1 hora con 3 intentos fallidos
  if (u.bloqueado_hasta && new Date(u.bloqueado_hasta) > new Date())
    return res.status(423).json({ error: 'Usuario bloqueado por intentos fallidos. Intenta de nuevo en 1 hora.' });

  if (!(await bcrypt.compare(contrasena || '', u.contrasena))) {
    const intentos = u.intentos_fallidos + 1;
    if (intentos >= 3) {
      await db.query('UPDATE usuarios SET intentos_fallidos=0, estado_bloqueo=1, bloqueado_hasta=DATE_ADD(NOW(), INTERVAL 1 HOUR) WHERE id_usuario=?', [u.id_usuario]);
      return res.status(423).json({ error: 'Usuario bloqueado por 1 hora tras 3 intentos incorrectos.' });
    }
    await db.query('UPDATE usuarios SET intentos_fallidos=? WHERE id_usuario=?', [intentos, u.id_usuario]);
    return res.status(401).json({ error: `Cédula o contraseña incorrecta. Intentos restantes: ${3 - intentos}.` });
  }
  await db.query('UPDATE usuarios SET intentos_fallidos=0, estado_bloqueo=0, bloqueado_hasta=NULL WHERE id_usuario=?', [u.id_usuario]);

  let id_conductor = null;
  if (u.rol === 'conductor') {
    const [[c]] = await db.query('SELECT id_conductor FROM conductores WHERE cedula=?', [u.cedula]);
    id_conductor = c?.id_conductor ?? null;
  }
  const token = jwt.sign({ id: u.id_usuario, rol: u.rol, id_conductor }, process.env.JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, rol: u.rol });
}));
// RF-08: el cierre de sesión se hace descartando el token en el cliente

/* ---------- RF-02: empleados (conductores) ---------- */
const esquemaConductor = { cedula: r.cedula, nombre_completo: r.texto, eps: r.texto, direccion: r.texto, telefono_emergencia: r.telefono };

app.get('/api/conductores', ...admin, handle(async (req, res) => {
  const [rows] = await db.query('SELECT * FROM conductores ORDER BY nombre_completo');
  res.json(rows);
}));

// lista mínima para selects (aux)
app.get('/api/conductores/lista', requireAuth, handle(async (req, res) => {
  const [rows] = await db.query('SELECT id_conductor, nombre_completo FROM conductores ORDER BY nombre_completo');
  res.json(rows);
}));

app.post('/api/conductores', ...admin, handle(async (req, res) => {
  const errores = validar(req.body, { ...esquemaConductor, contrasena: r.clave });
  if (errores) return bad(res, errores);
  const d = req.body;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('INSERT INTO usuarios (cedula, contrasena, rol) VALUES (?,?,?)', [d.cedula, await bcrypt.hash(d.contrasena, 10), 'conductor']);
    await conn.query('INSERT INTO conductores (cedula, nombre_completo, eps, direccion, telefono_emergencia) VALUES (?,?,?,?,?)',
      [d.cedula, d.nombre_completo.trim(), d.eps.trim(), d.direccion.trim(), d.telefono_emergencia]);
    await conn.commit();
    res.status(201).json({ ok: true });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}));

app.put('/api/conductores/:id', ...admin, handle(async (req, res) => {
  const errores = validar(req.body, { nombre_completo: r.texto, eps: r.texto, direccion: r.texto, telefono_emergencia: r.telefono });
  if (errores) return bad(res, errores);
  const d = req.body;
  await db.query('UPDATE conductores SET nombre_completo=?, eps=?, direccion=?, telefono_emergencia=? WHERE id_conductor=?',
    [d.nombre_completo.trim(), d.eps.trim(), d.direccion.trim(), d.telefono_emergencia, req.params.id]);
  if (d.contrasena) {                       // cambio de clave opcional
    const e = validar(d, { contrasena: r.clave });
    if (e) return bad(res, e);
    await db.query('UPDATE usuarios u JOIN conductores c ON c.cedula=u.cedula SET u.contrasena=? WHERE c.id_conductor=?',
      [await bcrypt.hash(d.contrasena, 10), req.params.id]);
  }
  res.json({ ok: true });
}));

app.delete('/api/conductores/:id', ...admin, handle(async (req, res) => {
  const [[c]] = await db.query('SELECT cedula FROM conductores WHERE id_conductor=?', [req.params.id]);
  if (!c) return res.status(404).json({ error: 'Conductor no encontrado.' });
  await db.query('DELETE FROM conductores WHERE id_conductor=?', [req.params.id]);
  await db.query('DELETE FROM usuarios WHERE cedula=?', [c.cedula]);
  res.json({ ok: true });
}));

/* ---------- RF-03: vehículos ---------- */
const esquemaVehiculo = { modelo: r.texto, soat: r.fecha, tecnomecanica: r.fecha, fumigacion: r.fecha };

app.get('/api/vehiculos', requireAuth, handle(async (req, res) => {
  const [rows] = await db.query('SELECT * FROM vehiculos ORDER BY placa');
  res.json(rows);
}));

app.post('/api/vehiculos', ...admin, handle(async (req, res) => {
  const d = { ...req.body, placa: (req.body.placa || '').toUpperCase().trim() };
  const errores = validar(d, { placa: r.placa, ...esquemaVehiculo });
  if (errores) return bad(res, errores);
  await db.query('INSERT INTO vehiculos (placa, modelo, soat, tecnomecanica, fumigacion) VALUES (?,?,?,?,?)',
    [d.placa, d.modelo.trim(), d.soat, d.tecnomecanica, d.fumigacion]);
  res.status(201).json({ ok: true });
}));

app.put('/api/vehiculos/:placa', ...admin, handle(async (req, res) => {
  const errores = validar(req.body, esquemaVehiculo);
  if (errores) return bad(res, errores);
  const d = req.body;
  await db.query('UPDATE vehiculos SET modelo=?, soat=?, tecnomecanica=?, fumigacion=? WHERE placa=?',
    [d.modelo.trim(), d.soat, d.tecnomecanica, d.fumigacion, req.params.placa]);
  res.json({ ok: true });
}));

app.delete('/api/vehiculos/:placa', ...admin, handle(async (req, res) => {
  await db.query('DELETE FROM vehiculos WHERE placa=?', [req.params.placa]);
  res.json({ ok: true });
}));

/* ---------- RF-04 / RF-05: recibos de viaje ---------- */
const esquemaRecibo = {
  num_recibo: v => /^[A-Za-z0-9-]{1,30}$/.test(v) || 'Número de recibo no válido (solo letras, números y guion).',
  fecha: r.fecha, destino: r.texto, tipo_carga: r.texto,
  cantidad: r.entero, valor_viaje: r.entero, placa: r.placa,
};

// El conductor registra; su id sale del token, no del formulario
app.post('/api/recibos', requireAuth, requireRole('conductor'), handle(async (req, res) => {
  const d = { ...req.body, placa: (req.body.placa || '').toUpperCase().trim(), num_recibo: String(req.body.num_recibo || '').trim() };
  const errores = validar(d, esquemaRecibo);
  if (errores) return bad(res, errores);
  if (!req.user.id_conductor) return res.status(403).json({ error: 'Tu usuario no tiene un conductor asociado.' });
  await db.query(
    'INSERT INTO recibos_viaje (num_recibo, fecha, destino, tipo_carga, cantidad, valor_viaje, id_conductor, id_auxiliar, placa) VALUES (?,?,?,?,?,?,?,?,?)',
    [d.num_recibo, d.fecha, d.destino.trim(), d.tipo_carga.trim(), d.cantidad, d.valor_viaje, req.user.id_conductor, d.id_auxiliar || null, d.placa]);
  res.status(201).json({ ok: true, mensaje: 'Recibo registrado correctamente.' });
}));

// RF-06: consulta con filtros (admin)
app.get('/api/recibos', ...admin, handle(async (req, res) => {
  const { desde, hasta, id_conductor, placa } = req.query;
  const where = [], p = [];
  if (desde) { where.push('rv.fecha >= ?'); p.push(desde); }
  if (hasta) { where.push('rv.fecha <= ?'); p.push(hasta); }
  if (id_conductor) { where.push('rv.id_conductor = ?'); p.push(id_conductor); }
  if (placa) { where.push('rv.placa = ?'); p.push(placa); }
  const [rows] = await db.query(
    `SELECT rv.*, c.nombre_completo AS conductor, a.nombre_completo AS auxiliar
     FROM recibos_viaje rv
     JOIN conductores c ON c.id_conductor = rv.id_conductor
     LEFT JOIN conductores a ON a.id_conductor = rv.id_auxiliar
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY rv.fecha DESC`, p);
  res.json(rows);
}));

app.put('/api/recibos/:num', ...admin, handle(async (req, res) => {
  const { num_recibo, ...resto } = esquemaRecibo;
  const d = { ...req.body, placa: (req.body.placa || '').toUpperCase().trim() };
  const errores = validar(d, resto);
  if (errores) return bad(res, errores);
  await db.query('UPDATE recibos_viaje SET fecha=?, destino=?, tipo_carga=?, cantidad=?, valor_viaje=?, id_auxiliar=?, placa=? WHERE num_recibo=?',
    [d.fecha, d.destino.trim(), d.tipo_carga.trim(), d.cantidad, d.valor_viaje, d.id_auxiliar || null, d.placa, req.params.num]);
  res.json({ ok: true });
}));

app.delete('/api/recibos/:num', ...admin, handle(async (req, res) => {
  await db.query('DELETE FROM recibos_viaje WHERE num_recibo=?', [req.params.num]);
  res.json({ ok: true });
}));

/* ---------- Reportes básicos (admin) ---------- */
app.get('/api/reportes/facturacion', ...admin, handle(async (req, res) => {
  const { desde, hasta } = req.query;
  const w = [], p = [];
  if (desde) { w.push('fecha >= ?'); p.push(desde); }
  if (hasta) { w.push('fecha <= ?'); p.push(hasta); }
  const cond = w.length ? 'WHERE ' + w.join(' AND ') : '';
  const [[total]] = await db.query(`SELECT COALESCE(SUM(valor_viaje),0) AS total, COUNT(*) AS viajes FROM recibos_viaje ${cond}`, p);
  const [porVehiculo] = await db.query(`SELECT placa, COUNT(*) AS viajes, SUM(valor_viaje) AS total FROM recibos_viaje ${cond} GROUP BY placa ORDER BY total DESC`, p);
  const [porConductor] = await db.query(
    `SELECT c.nombre_completo AS conductor, COUNT(*) AS viajes, SUM(rv.valor_viaje) AS total
     FROM recibos_viaje rv JOIN conductores c ON c.id_conductor = rv.id_conductor
     ${cond.replace(/fecha/g, 'rv.fecha')} GROUP BY c.id_conductor ORDER BY total DESC`, p);
  res.json({ total, porVehiculo, porConductor });
}));

app.listen(process.env.PORT || 3000, () => console.log('API WAIH activa'));
