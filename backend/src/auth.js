const jwt = require('jsonwebtoken');

// RF-01 / RF-07: validación
function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Sesión no válida. Inicia sesión de nuevo.' });
  }
}

// RF-07: restringe por rol
const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.rol)
    ? next()
    : res.status(403).json({ error: 'No tienes permiso para esta acción.' });

module.exports = { requireAuth, requireRole };
