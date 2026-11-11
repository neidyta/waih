# WAIH – Sistema de gestión operativa (MVP)

## 1. Base de datos
mysql -u root -p < backend/schema.sql

## 2. Backend
cd backend
npm install
cp .env.example .env      # edita tus datos
npm run seed              # crea el administrador
npm run dev               # http://localhost:3000

## 3. Frontend
Abre `frontend/index.html` con la extensión Live Server (VS Code) o:
npx serve frontend -l 5500
Ajusta `FRONTEND_URL` en .env a la URL que uses y `API` en index.html si cambias el puerto.

## 4. Despliegue
- Backend: Render (Node) con las variables del .env. Base de datos MySQL en un servicio externo.
- Frontend: Vercel (carpeta `frontend`), cambiando `API` a la URL de Render.
