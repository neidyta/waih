// RF-05 / RNF-04: validación centralizadas
const reglas = {
  cedula: v => /^\d{6,12}$/.test(v) || 'La cédula debe tener entre 6 y 12 dígitos, sin puntos.',
  texto: (v, min = 2) => (typeof v === 'string' && v.trim().length >= min) || 'Este campo es obligatorio.',
  telefono: v => /^\d{7,10}$/.test(v) || 'El teléfono debe tener entre 7 y 10 dígitos, sin espacios ni signos.',
  placa: v => /^[A-Z]{3}\d{3}$/.test(v) || 'La placa debe tener formato ABC123.',
  fecha: v => /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)) || 'Fecha inválida.',
  entero: v => /^\d+$/.test(String(v)) && Number(v) > 0 || 'Ingresa solo números, sin puntos ni comas.',
  clave: v => (typeof v === 'string' && v.length >= 8 && /[A-Z]/.test(v)) ||
    'La contraseña debe tener mínimo 8 caracteres y una mayúscula.',
};

// esquema: { campo: regla | [regla, 'etiqueta'] }  -> devuelve {campo: mensaje} o null
function validar(datos, esquema) {
  const errores = {};
  for (const [campo, regla] of Object.entries(esquema)) {
    const r = regla(datos[campo] ?? '');
    if (r !== true) errores[campo] = r;
  }
  return Object.keys(errores).length ? errores : null;
}

module.exports = { reglas, validar };
