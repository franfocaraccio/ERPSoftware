-- Datos de demostración para una organización.
--
-- NO es una migración: no está en drizzle/ ni en el journal, y no se aplica
-- sola en ningún entorno. Se pega en el SQL Editor de Supabase y se ejecuta a
-- mano, cuando se quiere una organización con datos para mirar el panel.
--
-- Las fechas son relativas a `current_date`, así que el resultado sigue siendo
-- útil dentro de un mes: las ventas viejas alimentan el gráfico mensual y las
-- recientes caen dentro de las trece semanas de la proyección de caja.
--
-- Cambiá el mail de la primera consulta si querés cargárselo a otra cuenta.
do $$
declare
  v_tenant text;
  v_hoy date := current_date;
  v_mail text := 'empresa1@gmail.com';
begin
  select o.id into v_tenant
  from organization o
  join member m on m.organization_id = o.id
  join "user" u on u.id = m.user_id
  where u.email = v_mail
  limit 1;

  if v_tenant is null then
    raise exception 'No encontré ninguna organización para %', v_mail;
  end if;

  -- Las tablas de negocio tienen FORCE ROW LEVEL SECURITY, así que las
  -- políticas se aplican incluso al dueño de las tablas. Sin esto, los INSERT
  -- fallarían o no insertarían nada según el rol con el que se corra.
  perform set_config('app.tenant_id', v_tenant, true);

  if exists (select 1 from comprobantes_venta where tenant_id = v_tenant) then
    raise exception 'Esa organización ya tiene comprobantes. Correr esto de nuevo duplicaría todo; limpiá primero (ver el final del archivo).';
  end if;

  -- --- Cuentas -------------------------------------------------------------
  -- El saldo no se guarda: sale de sumar los movimientos de cada cuenta.
  insert into cuentas (tenant_id, nombre, tipo, moneda) values
    (v_tenant, 'Caja', 'efectivo', 'ARS'),
    (v_tenant, 'Banco Nación — cuenta corriente', 'cuenta_corriente', 'ARS'),
    (v_tenant, 'Caja de ahorro en dólares', 'caja_ahorro', 'USD');

  -- --- Clientes ------------------------------------------------------------
  -- Los CUIT son válidos de verdad (dígito verificador incluido), para que se
  -- puedan abrir y guardar desde la UI sin que la validación los rechace.
  insert into clientes (tenant_id, razon_social, cuit, condicion_iva, email, telefono, direccion, limite_credito, estado) values
    (v_tenant, 'Distribuidora del Sur SA',  '30710000006', 'responsable_inscripto', 'compras@delsur.com.ar',   '1145678901', 'Av. Mitre 2340, Avellaneda',      3000000.00, 'activo'),
    (v_tenant, 'Corralón Belgrano SRL',     '30710000014', 'responsable_inscripto', 'admin@corralonbel.com.ar','1156789012', 'Cabildo 1875, CABA',              1500000.00, 'activo'),
    (v_tenant, 'Ferretería Industrial MyM', '30710000022', 'responsable_inscripto', 'ventas@mym.com.ar',       '1167890123', 'Ruta 8 km 34, Malvinas Argentinas',2000000.00, 'activo'),
    (v_tenant, 'Metalúrgica Pilar SA',      '30710000030', 'responsable_inscripto', 'pagos@metalpilar.com.ar', '2304445566', 'Parque Industrial Pilar',         4000000.00, 'activo'),
    (v_tenant, 'Obras y Servicios Norte',   '30710000049', 'monotributo',           'osnorte@gmail.com',       '1178901234', 'San Martín 450, San Isidro',       800000.00, 'en_mora'),
    (v_tenant, 'Construcciones Aráoz',      '30710000057', 'responsable_inscripto', 'info@araoz.com.ar',       '1189012345', 'Aráoz 1200, CABA',                1200000.00, 'activo');

  -- --- Proveedores ---------------------------------------------------------
  insert into proveedores (tenant_id, razon_social, cuit, condicion_iva, rubro, condicion_pago_dias, cbu, alias_cbu, email, telefono) values
    (v_tenant, 'Aceros del Plata SA',    '30710000065', 'responsable_inscripto', 'Hierro y acero',   30, '0170099220000067797890', 'aceros.plata.pago',  'ventas@acerosdelplata.com.ar', '1143210987'),
    (v_tenant, 'Tornillos Córdoba SRL',  '30710000073', 'responsable_inscripto', 'Bulonería',        45, '0290051110000000123456', 'tornillos.cba',      'pedidos@tornicba.com.ar',      '3514567890'),
    (v_tenant, 'Pinturas Litoral',       '30710000081', 'responsable_inscripto', 'Pinturas',         30, '0110599520000012345678', 'pinturas.litoral',   'admin@pinturaslitoral.com.ar', '3424567890'),
    (v_tenant, 'Herramientas Global SA', '30710000103', 'responsable_inscripto', 'Herramientas',     60, '0070123430004567890123', 'herr.global.sa',     'compras@hglobal.com.ar',       '1132109876'),
    (v_tenant, 'Logística Ruta 9',       '30710000111', 'monotributo',           'Fletes',            0, '0140999801234567890123', 'ruta9.fletes',       'ruta9fletes@gmail.com',        '3487654321');

  -- --- Productos -----------------------------------------------------------
  -- costo_unitario importa: el KPI de margen compara lo facturado contra el
  -- costo de lo que salió, y sin costo el margen queda en 100%.
  insert into productos (tenant_id, sku, descripcion, categoria, costo_unitario, precio_venta, moneda, stock_actual, stock_minimo, proveedor_principal_id)
  select v_tenant, p.sku, p.descripcion, p.categoria, p.costo, p.precio, 'ARS', p.stock, p.minimo,
         (select id from proveedores where tenant_id = v_tenant and razon_social = p.proveedor)
  from (values
    ('FE-001', 'Hierro redondo 8mm x 12m',        'Hierro',       18500.00,  27500.00, 240, 60,  'Aceros del Plata SA'),
    ('FE-002', 'Hierro ángulo 1" x 6m',           'Hierro',       12400.00,  18900.00, 180, 40,  'Aceros del Plata SA'),
    ('FE-003', 'Chapa galvanizada C25 1x2m',      'Hierro',       31000.00,  46500.00,  75, 25,  'Aceros del Plata SA'),
    ('BU-010', 'Tornillo autoperforante 8x1 (x100)','Bulonería',   4200.00,   6900.00, 520, 150, 'Tornillos Córdoba SRL'),
    ('BU-011', 'Bulón hexagonal 1/2 (x50)',       'Bulonería',     6800.00,  10500.00, 310, 100, 'Tornillos Córdoba SRL'),
    ('BU-012', 'Tarugo fischer 8mm (x200)',       'Bulonería',     3100.00,   5200.00, 140, 150, 'Tornillos Córdoba SRL'),
    ('PI-020', 'Látex interior 20L',              'Pinturas',     42000.00,  63000.00,  48, 15,  'Pinturas Litoral'),
    ('PI-021', 'Esmalte sintético 4L',            'Pinturas',     18900.00,  28500.00,  92, 30,  'Pinturas Litoral'),
    ('PI-022', 'Fijador al agua 10L',             'Pinturas',     21500.00,  32000.00,  26, 30,  'Pinturas Litoral'),
    ('HE-030', 'Amoladora angular 4.5"',          'Herramientas', 68000.00, 105000.00,  18,  8,  'Herramientas Global SA'),
    ('HE-031', 'Taladro percutor 750W',           'Herramientas', 82000.00, 128000.00,  12,  8,  'Herramientas Global SA'),
    ('HE-032', 'Set de mechas HSS 19 piezas',     'Herramientas', 15600.00,  24900.00,  64, 20,  'Herramientas Global SA')
  ) as p(sku, descripcion, categoria, costo, precio, stock, minimo, proveedor);

  -- --- Comprobantes de venta ----------------------------------------------
  -- Las viejas alimentan el gráfico de evolución mensual. Las recientes, con
  -- su condición de venta, caen dentro de las trece semanas de la proyección:
  -- el cobro se estima en fecha_emision + condicion_venta_dias.
  insert into comprobantes_venta (tenant_id, clase, letra, punto_venta, numero, cliente_id, fecha_emision,
                                  condicion_iva_receptor, condicion_venta_dias, estado, moneda, neto, iva, total)
  select v_tenant, 'factura', 'A', 1, v.numero,
         (select id from clientes where tenant_id = v_tenant and razon_social = v.cliente),
         v_hoy - v.dias_atras, 'responsable_inscripto', v.plazo, 'aprobada', 'ARS', 0, 0, 0
  from (values
    ( 1, 'Distribuidora del Sur SA',  172, 30),
    ( 2, 'Corralón Belgrano SRL',     158, 30),
    ( 3, 'Metalúrgica Pilar SA',      146, 45),
    ( 4, 'Ferretería Industrial MyM', 133, 30),
    ( 5, 'Construcciones Aráoz',      121, 30),
    ( 6, 'Distribuidora del Sur SA',  109, 45),
    ( 7, 'Corralón Belgrano SRL',      96, 30),
    ( 8, 'Obras y Servicios Norte',    88, 30),
    ( 9, 'Metalúrgica Pilar SA',       74, 45),
    (10, 'Ferretería Industrial MyM',  61, 30),
    (11, 'Construcciones Aráoz',       52, 30),
    (12, 'Distribuidora del Sur SA',   41, 45),
    (13, 'Corralón Belgrano SRL',      28, 30),
    (14, 'Metalúrgica Pilar SA',       21, 60),
    (15, 'Ferretería Industrial MyM',  14, 45),
    (16, 'Construcciones Aráoz',        9, 30),
    (17, 'Distribuidora del Sur SA',    4, 60),
    (18, 'Corralón Belgrano SRL',       1, 45)
  ) as v(numero, cliente, dias_atras, plazo);

  -- Dos ítems por comprobante, contra productos reales. El neto se calcula
  -- después a partir de los ítems, así el comprobante y su detalle no pueden
  -- contradecirse.
  with prods as (
    select id, descripcion, precio_venta,
           (row_number() over (order by sku)) - 1 as pos
    from productos where tenant_id = v_tenant
  ),
  pares as (
    select cv.id as comprobante_id, o.orden,
           ((cv.numero * 2 + o.orden) % (select count(*) from prods))::bigint as pos
    from comprobantes_venta cv
    cross join (values (0), (1)) as o(orden)
    where cv.tenant_id = v_tenant
  )
  insert into items_comprobante_venta (tenant_id, comprobante_id, producto_id, descripcion, cantidad, precio_unitario, alicuota_iva, orden)
  select v_tenant, pa.comprobante_id, p.id, p.descripcion,
         (3 + ((pa.pos + pa.orden * 4) % 9))::numeric, p.precio_venta, '21', pa.orden
  from pares pa
  join prods p on p.pos = pa.pos;

  update comprobantes_venta cv
  set neto = t.neto,
      iva = round(t.neto * 0.21, 2),
      total = round(t.neto * 1.21, 2)
  from (
    select comprobante_id, sum(cantidad * precio_unitario) as neto
    from items_comprobante_venta
    where tenant_id = v_tenant
    group by comprobante_id
  ) t
  where cv.id = t.comprobante_id and cv.tenant_id = v_tenant;

  -- --- Comprobantes de compra ---------------------------------------------
  -- El pago se estima en fecha_recepcion + condicion_pago_dias: los recientes
  -- son los que aparecen como egresos en la proyección.
  insert into comprobantes_compra (tenant_id, proveedor_id, letra, numero_completo, fecha_emision, fecha_recepcion,
                                   condicion_pago_dias, concepto, moneda, neto, iva, total)
  select v_tenant,
         (select id from proveedores where tenant_id = v_tenant and razon_social = c.proveedor),
         'A', c.numero, v_hoy - c.dias_atras - 2, v_hoy - c.dias_atras, c.plazo, c.concepto, 'ARS',
         c.neto, round(c.neto * 0.21, 2), round(c.neto * 1.21, 2)
  from (values
    ('Aceros del Plata SA',    'A-0003-00001240', 118, 30, 'Reposición de hierro',        1850000.00),
    ('Tornillos Córdoba SRL',  'A-0005-00000871', 104, 45, 'Bulonería surtida',            620000.00),
    ('Pinturas Litoral',       'A-0002-00004410',  92, 30, 'Látex y esmaltes',             940000.00),
    ('Herramientas Global SA', 'A-0011-00000355',  78, 60, 'Herramienta eléctrica',       1420000.00),
    ('Aceros del Plata SA',    'A-0003-00001318',  63, 30, 'Chapa galvanizada',           1260000.00),
    ('Logística Ruta 9',       'A-0001-00000902',  55,  0, 'Fletes del mes',               180000.00),
    ('Tornillos Córdoba SRL',  'A-0005-00000934',  44, 45, 'Tarugos y autoperforantes',    480000.00),
    ('Pinturas Litoral',       'A-0002-00004587',  31, 30, 'Fijador y accesorios',         710000.00),
    ('Aceros del Plata SA',    'A-0003-00001402',  22, 30, 'Hierro redondo y ángulo',     2100000.00),
    ('Herramientas Global SA', 'A-0011-00000418',  16, 60, 'Amoladoras y mechas',          980000.00),
    ('Logística Ruta 9',       'A-0001-00000961',   8,  0, 'Fletes del mes',               210000.00),
    ('Tornillos Córdoba SRL',  'A-0005-00001002',   3, 45, 'Bulonería surtida',            560000.00)
  ) as c(proveedor, numero, dias_atras, plazo, concepto, neto);

  -- --- Movimientos ---------------------------------------------------------
  -- Definen el saldo de tesorería, que es el punto de partida de la
  -- proyección. Quedan 1.173.000 en pesos entre las dos cuentas: alcanza para
  -- operar y deja que alguna semana de la proyección se acerque al mínimo, que
  -- es lo que hace interesante mirar el gráfico.
  insert into movimientos (tenant_id, fecha, cuenta_id, tipo, medio_pago, concepto, importe, conciliado)
  select v_tenant, v_hoy - m.dias_atras,
         (select id from cuentas where tenant_id = v_tenant and nombre = m.cuenta),
         m.tipo::tipo_movimiento, m.medio::medio_pago, m.concepto, m.importe, m.dias_atras > 7
  from (values
    ('Banco Nación — cuenta corriente', 'ingreso', 'transferencia', 'Saldo inicial',                    120, 3800000.00),
    ('Caja',                            'ingreso', 'efectivo',      'Saldo inicial de caja',            120,  450000.00),
    ('Banco Nación — cuenta corriente', 'ingreso', 'transferencia', 'Cobranza Distribuidora del Sur',   112, 1240000.00),
    ('Banco Nación — cuenta corriente', 'egreso',  'transferencia', 'Pago Aceros del Plata',            105, 1850000.00),
    ('Caja',                            'ingreso', 'efectivo',      'Cobranza mostrador',                98,  320000.00),
    ('Banco Nación — cuenta corriente', 'ingreso', 'transferencia', 'Cobranza Corralón Belgrano',        91,  890000.00),
    ('Banco Nación — cuenta corriente', 'egreso',  'transferencia', 'Sueldos',                           90, 1650000.00),
    ('Banco Nación — cuenta corriente', 'egreso',  'transferencia', 'Pago Pinturas Litoral',             78,  940000.00),
    ('Caja',                            'egreso',  'efectivo',      'Gastos varios',                     74,   85000.00),
    ('Banco Nación — cuenta corriente', 'ingreso', 'transferencia', 'Cobranza Metalúrgica Pilar',        66, 1560000.00),
    ('Banco Nación — cuenta corriente', 'egreso',  'transferencia', 'Sueldos',                           60, 1650000.00),
    ('Banco Nación — cuenta corriente', 'egreso',  'transferencia', 'IVA período anterior',              56,  680000.00),
    ('Caja',                            'ingreso', 'efectivo',      'Cobranza mostrador',                49,  270000.00),
    ('Banco Nación — cuenta corriente', 'ingreso', 'transferencia', 'Cobranza Ferretería MyM',           42, 1120000.00),
    ('Banco Nación — cuenta corriente', 'egreso',  'transferencia', 'Pago Herramientas Global',          38, 1420000.00),
    ('Banco Nación — cuenta corriente', 'egreso',  'transferencia', 'Alquiler del depósito',             35,  520000.00),
    ('Banco Nación — cuenta corriente', 'ingreso', 'transferencia', 'Cobranza Construcciones Aráoz',     29,  760000.00),
    ('Banco Nación — cuenta corriente', 'egreso',  'transferencia', 'Sueldos',                           30, 1650000.00),
    ('Caja',                            'ingreso', 'efectivo',      'Cobranza mostrador',                22,  410000.00),
    ('Banco Nación — cuenta corriente', 'ingreso', 'transferencia', 'Cobranza Distribuidora del Sur',    15, 1380000.00),
    ('Banco Nación — cuenta corriente', 'egreso',  'transferencia', 'Pago Aceros del Plata',             12, 1260000.00),
    ('Caja',                            'egreso',  'efectivo',      'Gastos varios',                      9,   92000.00),
    ('Banco Nación — cuenta corriente', 'ingreso', 'transferencia', 'Cobranza Corralón Belgrano',         5,  980000.00),
    ('Banco Nación — cuenta corriente', 'egreso',  'transferencia', 'Fletes Ruta 9',                      2,  210000.00)
  ) as m(cuenta, tipo, medio, concepto, dias_atras, importe);

  -- --- Cheques en cartera --------------------------------------------------
  -- Entran a la proyección por su fecha de pago, y alimentan el KPI de
  -- concentración por librador.
  insert into cheques (tenant_id, numero, librador_cliente_id, librador_nombre, banco, fecha_emision, fecha_pago, importe, estado)
  select v_tenant, ch.numero,
         (select id from clientes where tenant_id = v_tenant and razon_social = ch.librador),
         ch.librador, ch.banco, v_hoy - ch.emitido, v_hoy + ch.paga_en, ch.importe, ch.estado::estado_cheque
  from (values
    ('00012345', 'Distribuidora del Sur SA',  'Banco Galicia',  40,  12,  680000.00, 'en_cartera'),
    ('00012346', 'Metalúrgica Pilar SA',      'Banco Santander',35,  26,  920000.00, 'en_cartera'),
    ('00012347', 'Corralón Belgrano SRL',     'Banco Nación',   28,  40,  540000.00, 'en_cartera'),
    ('00012348', 'Distribuidora del Sur SA',  'Banco Galicia',  21,  54, 1150000.00, 'en_cartera'),
    ('00012349', 'Construcciones Aráoz',      'Banco BBVA',     14,  68,  480000.00, 'en_cartera'),
    ('00012350', 'Ferretería Industrial MyM', 'Banco Macro',    12,  82,  760000.00, 'en_cartera'),
    ('00012280', 'Corralón Belgrano SRL',     'Banco Nación',   95, -25,  430000.00, 'acreditado'),
    ('00012281', 'Obras y Servicios Norte',   'Banco Credicoop',80, -15,  260000.00, 'rechazado')
  ) as ch(numero, librador, banco, emitido, paga_en, importe, estado);

  -- --- Impuestos -----------------------------------------------------------
  -- Los que tienen saldo impago y vencimiento futuro entran a la proyección
  -- como egresos. El vencido alimenta el KPI de obligaciones vencidas.
  insert into impuestos (tenant_id, tipo, periodo, base_imponible, alicuota, importe_pagado, fecha_vencimiento)
  select v_tenant, i.tipo::tipo_impuesto,
         date_trunc('month', v_hoy - i.periodo_atras * interval '1 month')::date,
         i.base, i.alicuota, i.pagado, v_hoy + i.vence_en
  from (values
    ('iva',        3, 8200000.00, 21.00, 1722000.00, -68),
    ('iva',        2, 7400000.00, 21.00, 1554000.00, -38),
    ('iibb',       2, 7400000.00,  3.50,  259000.00, -34),
    ('iva',        1, 9100000.00, 21.00,       0.00,  -6),
    ('iibb',       1, 9100000.00,  3.50,       0.00,   4),
    ('ganancias',  1, 4600000.00, 35.00,       0.00,  19),
    ('iva',        0, 8800000.00, 21.00,       0.00,  26),
    ('iibb',       0, 8800000.00,  3.50,       0.00,  34),
    ('monotributo',0,  120000.00, 100.00,      0.00,  12)
  ) as i(tipo, periodo_atras, base, alicuota, pagado, vence_en);

  -- --- Parámetros ----------------------------------------------------------
  -- Sin una fila acá, el panel usa los valores por defecto y el mínimo
  -- operativo queda en null: el gráfico de saldo proyectado no dibuja la línea
  -- de referencia ni marca semanas en alerta.
  insert into parametros (tenant_id, umbral_mora_dias, margen_objetivo, minimo_operativo)
  values (v_tenant, 45, 32.00, 1500000.00)
  on conflict do nothing;

  raise notice 'Datos de demo cargados en el tenant %', v_tenant;
end
$$;

-- Para volver atrás y poder correrlo de nuevo, reemplazando el mail:
--
--   do $$
--   declare v_tenant text;
--   begin
--     select o.id into v_tenant
--     from organization o
--     join member m on m.organization_id = o.id
--     join "user" u on u.id = m.user_id
--     where u.email = 'empresa1@gmail.com' limit 1;
--     perform set_config('app.tenant_id', v_tenant, true);
--     delete from items_comprobante_venta where tenant_id = v_tenant;
--     delete from comprobantes_venta      where tenant_id = v_tenant;
--     delete from comprobantes_compra     where tenant_id = v_tenant;
--     delete from movimientos             where tenant_id = v_tenant;
--     delete from cheques                 where tenant_id = v_tenant;
--     delete from impuestos               where tenant_id = v_tenant;
--     delete from productos               where tenant_id = v_tenant;
--     delete from proveedores             where tenant_id = v_tenant;
--     delete from clientes                where tenant_id = v_tenant;
--     delete from cuentas                 where tenant_id = v_tenant;
--     delete from parametros              where tenant_id = v_tenant;
--   end $$;
