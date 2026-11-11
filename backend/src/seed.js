// Crear el primer administrador
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./db');

(async () => {
  const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
  await db.query(
    "INSERT INTO usuarios (cedula, contrasena, rol) VALUES (?,?,'admin') ON DUPLICATE KEY UPDATE contrasena=VALUES(contrasena), rol='admin'",
    [process.env.ADMIN_CEDULA, hash]);
  console.log('Administrador listo. Cédula:', process.env.ADMIN_CEDULA);
  process.exit(0);
})();
