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
  -- Todo arranca el día 1 de hace cinco meses: seis meses completos o en curso,
  -- sin un primer mes a medias que pague un sueldo entero con medio mes de
  -- ventas.
  v_inicio date := (date_trunc('month', current_date) - interval '5 months')::date;
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
    (v_tenant, 'Distribuidora del Sur SA',  '30710000006', 'responsable_inscripto', 'compras@delsur.com.ar',   '1145678901', 'Av. Mitre 2340, Avellaneda',      5000000.00, 'activo'),
    (v_tenant, 'Corralón Belgrano SRL',     '30710000014', 'responsable_inscripto', 'admin@corralonbel.com.ar','1156789012', 'Cabildo 1875, CABA',              3500000.00, 'activo'),
    (v_tenant, 'Ferretería Industrial MyM', '30710000022', 'responsable_inscripto', 'ventas@mym.com.ar',       '1167890123', 'Ruta 8 km 34, Malvinas Argentinas',5000000.00, 'activo'),
    (v_tenant, 'Metalúrgica Pilar SA',      '30710000030', 'responsable_inscripto', 'pagos@metalpilar.com.ar', '2304445566', 'Parque Industrial Pilar',         6000000.00, 'activo'),
    (v_tenant, 'Obras y Servicios Norte',   '30710000049', 'monotributo',           'osnorte@gmail.com',       '1178901234', 'San Martín 450, San Isidro',      2000000.00, 'activo'),
    (v_tenant, 'Construcciones Aráoz',      '30710000057', 'responsable_inscripto', 'info@araoz.com.ar',       '1189012345', 'Aráoz 1200, CABA',                4000000.00, 'activo');

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
  -- El stock alcanza para unos dos meses de ventas (la rotación del panel
  -- queda cerca de 50 días), y tres productos quedan para reponer.
  insert into productos (tenant_id, sku, descripcion, categoria, costo_unitario, precio_venta, moneda, stock_actual, stock_minimo, proveedor_principal_id)
  select v_tenant, p.sku, p.descripcion, p.categoria, p.costo, p.precio, 'ARS', p.stock, p.minimo,
         (select id from proveedores where tenant_id = v_tenant and razon_social = p.proveedor)
  from (values
    ('FE-001', 'Hierro redondo 8mm x 12m',        'Hierro',       18500.00,  27500.00, 156, 60,  'Aceros del Plata SA'),
    ('FE-002', 'Hierro ángulo 1" x 6m',           'Hierro',       12400.00,  18900.00, 117, 40,  'Aceros del Plata SA'),
    ('FE-003', 'Chapa galvanizada C25 1x2m',      'Hierro',       31000.00,  46500.00,  49, 25,  'Aceros del Plata SA'),
    ('BU-010', 'Tornillo autoperforante 8x1 (x100)','Bulonería',   4200.00,   6900.00, 338, 150, 'Tornillos Córdoba SRL'),
    ('BU-011', 'Bulón hexagonal 1/2 (x50)',       'Bulonería',     6800.00,  10500.00, 202, 100, 'Tornillos Córdoba SRL'),
    ('BU-012', 'Tarugo fischer 8mm (x200)',       'Bulonería',     3100.00,   5200.00,  91, 150, 'Tornillos Córdoba SRL'),
    ('PI-020', 'Látex interior 20L',              'Pinturas',     42000.00,  63000.00,  31, 15,  'Pinturas Litoral'),
    ('PI-021', 'Esmalte sintético 4L',            'Pinturas',     18900.00,  28500.00,  60, 30,  'Pinturas Litoral'),
    ('PI-022', 'Fijador al agua 10L',             'Pinturas',     21500.00,  32000.00,  17, 30,  'Pinturas Litoral'),
    ('HE-030', 'Amoladora angular 4.5"',          'Herramientas', 68000.00, 105000.00,  12,  8,  'Herramientas Global SA'),
    ('HE-031', 'Taladro percutor 750W',           'Herramientas', 82000.00, 128000.00,   8,  8,  'Herramientas Global SA'),
    ('HE-032', 'Set de mechas HSS 19 piezas',     'Herramientas', 15600.00,  24900.00,  42, 20,  'Herramientas Global SA')
  ) as p(sku, descripcion, categoria, costo, precio, stock, minimo, proveedor);

  -- El stock con el que arranca cada producto, como movimiento inicial: el
  -- stock se mueve con movimientos y la historia tiene que cerrar.
  insert into movimientos_stock (tenant_id, producto_id, fecha, tipo, cantidad, costo_unitario, motivo)
  select v_tenant, id, v_inicio - 1, 'inicial', stock_actual, costo_unitario, 'Stock inicial de la demo'
  from productos
  where tenant_id = v_tenant and stock_actual <> 0;

  -- --- Comprobantes de venta ----------------------------------------------
  -- Una factura cada dos días durante seis meses: unos 10 millones netos por
  -- mes, lo que necesita una distribuidora con estos gastos fijos para ganar
  -- plata. Las viejas alimentan el gráfico mensual y el estado de resultados;
  -- las recientes, con su plazo, caen en la proyección (el cobro se estima en
  -- fecha_emision + condicion_venta_dias).
  --
  -- Un mes flojo a propósito (el de hace unos 75 días), con la mitad de las
  -- ventas: da pérdida, y la lectura del mes tiene algo que explicar.
  insert into comprobantes_venta (tenant_id, clase, letra, punto_venta, numero, cliente_id, fecha_emision,
                                  condicion_iva_receptor, condicion_venta_dias, estado, moneda, neto, iva, total)
  select v_tenant, 'factura', 'A', 1, g.n,
         (select id from clientes where tenant_id = v_tenant and razon_social = (array[
            'Distribuidora del Sur SA', 'Corralón Belgrano SRL', 'Metalúrgica Pilar SA',
            'Ferretería Industrial MyM', 'Construcciones Aráoz', 'Distribuidora del Sur SA',
            'Metalúrgica Pilar SA', 'Corralón Belgrano SRL', 'Ferretería Industrial MyM',
            'Obras y Servicios Norte', 'Construcciones Aráoz'])[1 + g.n % 11]),
         v_hoy - g.dias_atras, 'responsable_inscripto', (array[30, 30, 45, 30, 30])[1 + g.n % 5],
         'aprobada', 'ARS', 0, 0, 0
  from (
    select (row_number() over (order by d desc))::int as n, d as dias_atras
    from generate_series(v_hoy - v_inicio, 0, -2) as d
  ) g;

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
           ((cv.numero * 2 + o.orden) % (select count(*) from prods))::bigint as pos,
           date_trunc('month', cv.fecha_emision) = date_trunc('month', v_hoy - 75) as mes_flojo
    from comprobantes_venta cv
    cross join (values (0), (1)) as o(orden)
    where cv.tenant_id = v_tenant
  )
  insert into items_comprobante_venta (tenant_id, comprobante_id, producto_id, descripcion, cantidad, precio_unitario, alicuota_iva, orden)
  select v_tenant, pa.comprobante_id, p.id, p.descripcion,
         ceil((4 + ((pa.pos + pa.orden * 5) % 11)) * case when pa.mes_flojo then 0.5 else 1 end)::numeric,
         p.precio_venta, '21', pa.orden
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
  -- Mercadería cada cinco días, rotando proveedores, por lo que se vende al
  -- costo (unos 7 millones por mes). El pago se estima en fecha_recepcion +
  -- condicion_pago_dias: los recientes son los egresos de la proyección.
  insert into comprobantes_compra (tenant_id, proveedor_id, letra, numero_completo, fecha_emision, fecha_recepcion,
                                   condicion_pago_dias, concepto, moneda, neto, iva, total)
  select v_tenant, p.id, 'A',
         c.prefijo || lpad((1200 + c.n)::text, 8, '0'),
         v_hoy - c.dias_atras - 2, v_hoy - c.dias_atras, p.condicion_pago_dias, c.concepto, 'ARS',
         c.neto, round(c.neto * 0.21, 2), round(c.neto * 1.21, 2)
  from (
    select g.n, g.dias_atras, s.proveedor, s.prefijo, s.concepto,
           round(s.base * (0.85 + (g.n % 4) * 0.1)
                 * case when date_trunc('month', v_hoy - g.dias_atras) = date_trunc('month', v_hoy - 75)
                        then 0.6 else 1 end, -3) as neto
    from (
      select (row_number() over (order by d desc))::int as n, d as dias_atras
      from generate_series(v_hoy - v_inicio - 1, 2, -5) as d
    ) g
    join (values
      (0, 'Aceros del Plata SA',    'A-0003-', 'Hierro redondo y ángulo',  1600000.00),
      (1, 'Tornillos Córdoba SRL',  'A-0005-', 'Bulonería surtida',         550000.00),
      (2, 'Pinturas Litoral',       'A-0002-', 'Látex y esmaltes',         1100000.00),
      (3, 'Herramientas Global SA', 'A-0011-', 'Herramienta eléctrica',    1300000.00),
      (4, 'Aceros del Plata SA',    'A-0003-', 'Chapa galvanizada',        1600000.00),
      (5, 'Pinturas Litoral',       'A-0002-', 'Fijador y accesorios',     1100000.00)
    ) as s(turno, proveedor, prefijo, concepto, base) on s.turno = g.n % 6
  ) c
  join proveedores p on p.tenant_id = v_tenant and p.razon_social = c.proveedor;

  -- Los fletes, una vez por mes. Logística Ruta 9 es monotributista: factura C,
  -- sin IVA. Son un servicio, no mercadería (más abajo se les pone la
  -- categoría Fletes).
  insert into comprobantes_compra (tenant_id, proveedor_id, letra, numero_completo, fecha_emision, fecha_recepcion,
                                   condicion_pago_dias, concepto, moneda, neto, iva, total)
  select v_tenant, p.id, 'C', 'C-0001-' || lpad((900 + f.n)::text, 8, '0'),
         f.fecha, f.fecha, 0, 'Fletes del mes', 'ARS', f.neto, 0, f.neto
  from (
    select (row_number() over (order by m))::int as n, (m + interval '7 days')::date as fecha,
           180000.00 + (extract(month from m)::int % 3) * 30000 as neto
    from generate_series(v_inicio, v_hoy, interval '1 month') as m
  ) f
  join proveedores p on p.tenant_id = v_tenant and p.razon_social = 'Logística Ruta 9'
  where f.fecha <= v_hoy;

  -- --- Movimientos ---------------------------------------------------------
  -- Definen el saldo de tesorería, que es el punto de partida de la
  -- proyección.
  insert into movimientos (tenant_id, fecha, cuenta_id, tipo, medio_pago, concepto, importe, conciliado)
  select v_tenant, v_inicio - 1,
         (select id from cuentas where tenant_id = v_tenant and nombre = m.cuenta),
         m.tipo::tipo_movimiento, m.medio::medio_pago, m.concepto, m.importe, true
  from (values
    ('Banco Nación — cuenta corriente', 'ingreso', 'transferencia', 'Saldo inicial',          180, 2000000.00),
    ('Caja',                            'ingreso', 'efectivo',      'Saldo inicial de caja',  180,  900000.00)
  ) as m(cuenta, tipo, medio, concepto, dias_atras, importe);

  -- Los gastos fijos, todos los meses: sueldos a fin de mes, alquiler el 5,
  -- servicios el 12, gastos chicos de caja el 18 y comisiones del banco el 28.
  -- Sin esto el estado de resultados muestra meses sin gastos que parecen
  -- ganar plata.
  insert into movimientos (tenant_id, fecha, cuenta_id, tipo, medio_pago, concepto, importe, conciliado)
  select v_tenant, x.fecha,
         (select id from cuentas where tenant_id = v_tenant and nombre = x.cuenta),
         'egreso', x.medio::medio_pago, x.concepto, x.importe, x.fecha < v_hoy - 7
  from (
    select (m + g.dia * interval '1 day')::date as fecha, g.cuenta, g.medio, g.concepto,
           g.importe + (extract(month from m)::int % 3) * g.variacion as importe
    from generate_series(v_inicio, v_hoy, interval '1 month') as m
    cross join (values
      ( 4, 'Banco Nación — cuenta corriente', 'transferencia', 'Alquiler del depósito', 520000.00,     0.00),
      (11, 'Banco Nación — cuenta corriente', 'transferencia', 'Luz, gas e internet',   125000.00, 10000.00),
      (17, 'Caja',                            'efectivo',      'Gastos varios',          85000.00,  7000.00),
      (27, 'Banco Nación — cuenta corriente', 'transferencia', 'Comisiones bancarias',   42000.00,  3000.00)
    ) as g(dia, cuenta, medio, concepto, importe, variacion)
    union all
    select (m + interval '1 month' - interval '1 day')::date, 'Banco Nación — cuenta corriente',
           'transferencia', 'Sueldos', 1650000.00
    from generate_series(v_inicio, v_hoy, interval '1 month') as m
  ) x
  where x.fecha <= v_hoy;

  -- Cobranzas: las facturas ya vencidas, salvo las que quedan impagas a
  -- propósito: las viejas de Obras y Servicios Norte (el cliente en mora) y la
  -- última vencida de Construcciones Aráoz, para que haya algo vencido que
  -- mirar sin que sea mora.
  insert into movimientos (tenant_id, fecha, cuenta_id, tipo, medio_pago, concepto, importe, conciliado, cliente_id)
  select v_tenant,
         cv.fecha_emision + cv.condicion_venta_dias,
         (select id from cuentas where tenant_id = v_tenant and nombre = 'Banco Nación — cuenta corriente'),
         'ingreso', 'transferencia',
         'Cobranza ' || c.razon_social || ' — factura ' || cv.numero,
         cv.total,
         cv.fecha_emision + cv.condicion_venta_dias < v_hoy - 7,
         cv.cliente_id
  from comprobantes_venta cv
  join clientes c on c.id = cv.cliente_id
  where cv.tenant_id = v_tenant
    and cv.fecha_emision + cv.condicion_venta_dias <= v_hoy
    and not (c.razon_social = 'Obras y Servicios Norte'
             and cv.fecha_emision + cv.condicion_venta_dias between v_hoy - 95 and v_hoy - 50)
    and cv.id <> coalesce((
      select v.id from comprobantes_venta v join clientes k on k.id = v.cliente_id
      where v.tenant_id = v_tenant and k.razon_social = 'Construcciones Aráoz'
        and v.fecha_emision + v.condicion_venta_dias < v_hoy
      order by v.fecha_emision desc limit 1), '00000000-0000-0000-0000-000000000000'::uuid);

  -- Pagos a proveedores: las compras ya vencidas, salvo la última vencida de
  -- Pinturas Litoral, que queda impaga.
  insert into movimientos (tenant_id, fecha, cuenta_id, tipo, medio_pago, concepto, importe, conciliado, proveedor_id)
  select v_tenant,
         cc.fecha_recepcion + cc.condicion_pago_dias,
         (select id from cuentas where tenant_id = v_tenant and nombre = 'Banco Nación — cuenta corriente'),
         'egreso', 'transferencia',
         'Pago ' || p.razon_social || ' — ' || cc.numero_completo,
         cc.total,
         cc.fecha_recepcion + cc.condicion_pago_dias < v_hoy - 7,
         cc.proveedor_id
  from comprobantes_compra cc
  join proveedores p on p.id = cc.proveedor_id
  where cc.tenant_id = v_tenant
    and cc.fecha_recepcion + cc.condicion_pago_dias <= v_hoy
    and cc.id <> coalesce((
      select k.id from comprobantes_compra k join proveedores q on q.id = k.proveedor_id
      where k.tenant_id = v_tenant and q.razon_social = 'Pinturas Litoral'
        and k.fecha_recepcion + k.condicion_pago_dias < v_hoy
      order by k.fecha_recepcion desc limit 1), '00000000-0000-0000-0000-000000000000'::uuid);

  -- Cada cobro y cada pago, imputado a su comprobante, como se hace desde la
  -- app. Sin imputación el sistema aplica lo cobrado a lo más viejo (FIFO): el
  -- cobro de una factura nueva taparía la vieja impaga y nadie quedaría en mora.
  insert into imputaciones (tenant_id, movimiento_id, comprobante_venta_id, importe)
  select v_tenant, m.id, cv.id, m.importe
  from movimientos m
  join comprobantes_venta cv on cv.tenant_id = v_tenant and cv.cliente_id = m.cliente_id
  join clientes c on c.id = cv.cliente_id
  where m.tenant_id = v_tenant
    and m.concepto = 'Cobranza ' || c.razon_social || ' — factura ' || cv.numero;

  insert into imputaciones (tenant_id, movimiento_id, comprobante_compra_id, importe)
  select v_tenant, m.id, cc.id, m.importe
  from movimientos m
  join comprobantes_compra cc on cc.tenant_id = v_tenant and cc.proveedor_id = m.proveedor_id
  join proveedores p on p.id = cc.proveedor_id
  where m.tenant_id = v_tenant
    and m.concepto = 'Pago ' || p.razon_social || ' — ' || cc.numero_completo;

  -- --- Cheques en cartera --------------------------------------------------
  -- Entran a la proyección por su fecha de pago, y alimentan el KPI de
  -- concentración por librador.
  insert into cheques (tenant_id, numero, librador_cliente_id, librador_nombre, banco, fecha_emision, fecha_pago, importe, estado)
  select v_tenant, ch.numero,
         (select id from clientes where tenant_id = v_tenant and razon_social = ch.librador),
         ch.librador, ch.banco, v_hoy - ch.emitido, v_hoy + ch.paga_en, ch.importe, ch.estado::estado_cheque
  from (values
    ('00012345', 'Distribuidora del Sur SA',  'Banco Galicia',  40,  12, 1450000.00, 'en_cartera'),
    ('00012346', 'Metalúrgica Pilar SA',      'Banco Santander',35,  26, 1980000.00, 'en_cartera'),
    ('00012347', 'Corralón Belgrano SRL',     'Banco Nación',   28,  40, 1160000.00, 'en_cartera'),
    ('00012348', 'Distribuidora del Sur SA',  'Banco Galicia',  21,  54, 2400000.00, 'en_cartera'),
    ('00012349', 'Construcciones Aráoz',      'Banco BBVA',     14,  68, 1020000.00, 'en_cartera'),
    ('00012350', 'Ferretería Industrial MyM', 'Banco Macro',    12,  82, 1640000.00, 'en_cartera'),
    ('00012280', 'Corralón Belgrano SRL',     'Banco Nación',   95, -25,  920000.00, 'acreditado'),
    ('00012281', 'Obras y Servicios Norte',   'Banco Credicoop',80, -15,  560000.00, 'rechazado')
  ) as ch(numero, librador, banco, emitido, paga_en, importe, estado);

  -- --- Impuestos -----------------------------------------------------------
  -- El IVA no se carga: lo calcula el sistema con los comprobantes (débito de
  -- ventas menos crédito de compras). Cargarlo acá lo dejaría como histórico y
  -- taparía el cálculo de esos meses.
  --
  -- IIBB: base = lo facturado en el mes (neto), al 3,5 %. Los meses viejos
  -- quedan pagos por lo que resultó después de retenciones; el último vencido,
  -- impago a propósito para el KPI de impuestos vencidos.
  insert into impuestos (tenant_id, tipo, periodo, base_imponible, alicuota, importe_pagado, fecha_vencimiento)
  select v_tenant, 'iibb', m.periodo, m.neto, 3.50, 0,
         (m.periodo + interval '1 month' + interval '14 days')::date
  from (
    select date_trunc('month', fecha_emision)::date as periodo, sum(neto) as neto
    from comprobantes_venta
    where tenant_id = v_tenant
    group by 1
  ) m;

  -- Retenciones, percepciones y SIRCREB: restan del IIBB de su período.
  insert into retenciones_iibb (tenant_id, fecha, periodo, tipo, agente, comprobante, importe)
  select v_tenant, (i.periodo + interval '10 days')::date, i.periodo, r.tipo::tipo_retencion_iibb,
         r.agente, r.comprobante, round(i.base_imponible * r.proporcion, 2)
  from impuestos i
  cross join (values
    ('percepcion', 'Aceros del Plata SA',  'A-0003-00001402', 0.004),
    ('retencion',  'Metalúrgica Pilar SA', 'CR-0002-00011', 0.006),
    ('sircreb',    'Banco Nación',          null,           0.003)
  ) as r(tipo, agente, comprobante, proporcion)
  where i.tenant_id = v_tenant and i.tipo = 'iibb';

  -- Los meses ya vencidos, pagos por lo que quedó después de retenciones,
  -- salvo el último, que queda impago y vencido.
  update impuestos i set importe_pagado = greatest(
           round(i.base_imponible * i.alicuota / 100, 2)
           - coalesce((select sum(r.importe) from retenciones_iibb r
                       where r.tenant_id = v_tenant and r.periodo = i.periodo), 0), 0)
  where i.tenant_id = v_tenant and i.tipo = 'iibb' and i.fecha_vencimiento < v_hoy
    and i.periodo < (select max(periodo) from impuestos
                     where tenant_id = v_tenant and tipo = 'iibb' and fecha_vencimiento < v_hoy);

  -- IVA: los meses ya vencidos están pagos; el del último mes cerrado queda
  -- pendiente. Se registra sólo el pago (calculado = true): lo determinado lo
  -- calcula el sistema. El importe es débito menos crédito del mes; con ventas
  -- por encima de las compras no hay saldo a favor que arrastrar.
  insert into impuestos (tenant_id, tipo, periodo, importe_pagado, fecha_vencimiento, calculado)
  select v_tenant, 'iva', m.periodo, m.neto,
         (m.periodo + interval '1 month' + interval '19 days')::date, true
  from (
    select p.periodo,
           coalesce((select sum(iva) from comprobantes_venta
                     where tenant_id = v_tenant and date_trunc('month', fecha_emision) = p.periodo), 0)
         - coalesce((select sum(iva) from comprobantes_compra
                     where tenant_id = v_tenant and date_trunc('month', fecha_recepcion) = p.periodo), 0)
           as neto
    from (select distinct date_trunc('month', fecha_emision)::date as periodo
          from comprobantes_venta where tenant_id = v_tenant) p
  ) m
  where m.neto > 0
    and (m.periodo + interval '1 month' + interval '19 days')::date < v_hoy;

  -- Ganancias: un anticipo por importe, el que informa ARCA.
  insert into impuestos (tenant_id, tipo, periodo, importe_fijo, concepto, importe_pagado, fecha_vencimiento)
  values (v_tenant, 'ganancias', date_trunc('month', v_hoy)::date, 420000.00, 'Anticipo 5', 0,
          (date_trunc('month', v_hoy) + interval '14 days')::date);

  -- --- Categorías y gastos -------------------------------------------------
  -- La misma lista inicial que crea la app (modules/resultados/service.ts).
  insert into categorias (tenant_id, nombre, tipo, orden)
  select v_tenant, c.nombre, c.tipo::tipo_categoria, c.orden
  from (values
    ('Sueldos y cargas sociales', 'gasto', 0),
    ('Alquiler', 'gasto', 1),
    ('Servicios (luz, gas, internet)', 'gasto', 2),
    ('Fletes', 'gasto', 3),
    ('Honorarios', 'gasto', 4),
    ('Comisiones bancarias', 'gasto', 5),
    ('Impuestos y tasas', 'gasto', 6),
    ('Otros gastos', 'gasto', 7),
    ('Intereses ganados', 'ingreso', 8),
    ('Otros ingresos', 'ingreso', 9)
  ) as c(nombre, tipo, orden)
  on conflict do nothing;

  -- Los gastos sin comprobante, con su categoría: es lo que los lleva al
  -- estado de resultados.
  update movimientos m set categoria_id = c.id
  from categorias c
  where m.tenant_id = v_tenant and c.tenant_id = v_tenant
    and m.cliente_id is null and m.proveedor_id is null
    and c.nombre = case m.concepto
      when 'Sueldos' then 'Sueldos y cargas sociales'
      when 'Alquiler del depósito' then 'Alquiler'
      when 'Gastos varios' then 'Otros gastos'
      when 'Luz, gas e internet' then 'Servicios (luz, gas, internet)'
      when 'Comisiones bancarias' then 'Comisiones bancarias'
    end;

  -- Los fletes son un servicio, no mercadería: gasto del mes.
  update comprobantes_compra cc set categoria_id = c.id
  from categorias c, proveedores p
  where cc.tenant_id = v_tenant and c.tenant_id = v_tenant and p.id = cc.proveedor_id
    and p.razon_social = 'Logística Ruta 9' and c.nombre = 'Fletes';

  -- Los gastos fijos se repiten todos los meses: se proyectan en la caja.
  insert into gastos_recurrentes (tenant_id, descripcion, categoria_id, cuenta_id, importe, dia_del_mes, desde)
  select v_tenant, g.descripcion,
         (select id from categorias where tenant_id = v_tenant and nombre = g.categoria),
         (select id from cuentas where tenant_id = v_tenant and nombre = 'Banco Nación — cuenta corriente'),
         g.importe, g.dia, v_inicio
  from (values
    ('Sueldos', 'Sueldos y cargas sociales', 1650000.00, 30),
    ('Alquiler del depósito', 'Alquiler', 520000.00, 5),
    ('Luz, gas e internet', 'Servicios (luz, gas, internet)', 135000.00, 12)
  ) as g(descripcion, categoria, importe, dia);

  -- --- Parámetros ----------------------------------------------------------
  -- Sin una fila acá, el panel usa los valores por defecto y el mínimo
  -- operativo queda en null: el gráfico de saldo proyectado no dibuja la línea
  -- de referencia ni marca semanas en alerta.
  insert into parametros (tenant_id, umbral_mora_dias, margen_objetivo, minimo_operativo, regimen_fiscal, dia_vencimiento_iva)
  values (v_tenant, 45, 32.00, 4000000.00, 'responsable_inscripto', 20)
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
--     -- Primero lo que apunta a otras tablas: imputaciones y movimientos
--     -- referencian comprobantes, y los ítems referencian productos.
--     delete from imputaciones            where tenant_id = v_tenant;
--     delete from movimientos_stock       where tenant_id = v_tenant;
--     delete from movimientos             where tenant_id = v_tenant;
--     delete from items_comprobante_venta where tenant_id = v_tenant;
--     delete from items_comprobante_compra where tenant_id = v_tenant;
--     delete from comprobantes_venta      where tenant_id = v_tenant;
--     delete from comprobantes_compra     where tenant_id = v_tenant;
--     delete from cheques                 where tenant_id = v_tenant;
--     delete from impuestos               where tenant_id = v_tenant;
--     delete from retenciones_iibb        where tenant_id = v_tenant;
--     delete from gastos_recurrentes      where tenant_id = v_tenant;
--     delete from productos               where tenant_id = v_tenant;
--     delete from proveedores             where tenant_id = v_tenant;
--     delete from clientes                where tenant_id = v_tenant;
--     delete from cuentas                 where tenant_id = v_tenant;
--     delete from parametros              where tenant_id = v_tenant;
--     delete from categorias              where tenant_id = v_tenant;
--   end $$;
