CREATE DATABASE IF NOT EXISTS waih CHARACTER SET utf8mb4;
USE waih;

CREATE TABLE usuarios (
  id_usuario INT AUTO_INCREMENT PRIMARY KEY,
  cedula VARCHAR(15) NOT NULL UNIQUE,
  contrasena VARCHAR(255) NOT NULL,
  rol ENUM('admin','conductor') NOT NULL DEFAULT 'conductor',
  estado_bloqueo TINYINT(1) NOT NULL DEFAULT 0,
  intentos_fallidos INT NOT NULL DEFAULT 0,
  bloqueado_hasta DATETIME NULL
);

CREATE TABLE conductores (
  id_conductor INT AUTO_INCREMENT PRIMARY KEY,
  cedula VARCHAR(15) NOT NULL UNIQUE,
  nombre_completo VARCHAR(120) NOT NULL,
  eps VARCHAR(80) NOT NULL,
  direccion VARCHAR(160) NOT NULL,
  telefono_emergencia VARCHAR(20) NOT NULL,
  FOREIGN KEY (cedula) REFERENCES usuarios(cedula) ON UPDATE CASCADE
);

CREATE TABLE vehiculos (
  placa VARCHAR(7) PRIMARY KEY,
  modelo VARCHAR(40) NOT NULL,
  soat DATE NOT NULL,
  tecnomecanica DATE NOT NULL,
  fumigacion DATE NOT NULL
);

CREATE TABLE recibos_viaje (
  num_recibo VARCHAR(30) PRIMARY KEY,
  fecha DATE NOT NULL,
  destino VARCHAR(100) NOT NULL,
  tipo_carga VARCHAR(60) NOT NULL,
  cantidad INT NOT NULL,
  valor_viaje BIGINT NOT NULL,
  id_conductor INT NOT NULL,
  id_auxiliar INT NULL,
  placa VARCHAR(7) NOT NULL,
  FOREIGN KEY (id_conductor) REFERENCES conductores(id_conductor),
  FOREIGN KEY (id_auxiliar) REFERENCES conductores(id_conductor),
  FOREIGN KEY (placa) REFERENCES vehiculos(placa) ON UPDATE CASCADE
);
