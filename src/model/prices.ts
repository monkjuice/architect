import type { TakeoffRow } from './takeoff'

/**
 * Local prices for the materials list: retail in the Buenos Aires area (AMBA), in Argentine pesos with VAT, as seen
 * on PRICES_SEEN, materials only (no labour). Each is per the unit of the row it prices, except doors, windows and
 * gates, which are per m² of opening, and a row is priced only when it is bought as it is (bricks, cement, a door):
 * work rows (a wall's m², a footing's m³, plaster) take their materials from the rows that are, so they have none.
 * Glass in windows and doors is in their price. Prices go stale fast with inflation: each says where it came from.
 */

export interface Price {
  /** ARS per the row's unit (per m² of opening for doors, windows and gates). */
  ars: number
  /** How it is sold, and where it was seen. */
  sold?: string
  source?: string
  /** Not found as such: worked out from something near it. */
  estimate?: boolean
}

export const PRICES_SEEN = '2026-11-08'

/** Pesos to a US dollar (MEP, selling) on PRICES_SEEN, for the total in dollars. */
export const USD_MEP = 1587.9

export const PRICES: Record<string, Price> = {
  'cement': { ars: 12653, sold: 'Cemento Loma Negra x 50 kg $12.652,85 (Prima Porta, CABA / San Martín)', source: 'https://www.primaporta.com.ar/product-page/cemento-x-50kg-loma-negra-ho' },
  'lime': { ars: 6840, sold: 'Cal Hidratada Extra 25 kg Cementos Avellaneda $6.840 (Easy)', source: 'https://www.easy.com.ar/e152-cal-hidrat-extra-25kg/p' },
  'sand': { ars: 49900, sold: 'Arena gruesa (oriental) a granel, typical $49.900/m³, range $31.445-68.453', source: 'https://servidos.ar/precio-materiales-construccion' },
  'gravel': { ars: 109000, sold: 'Bolsón Piedra Partida 1 m³ (1300 kg) Yaraví $109.000 (Easy)', source: 'https://www.easy.com.ar/bolson-piedra-partida-yrv/p' },
  'rebar': { ars: 2400, sold: 'Hierro ADN 420 Ø8 x 12 m Acindar $11.290; Ø10 x 12 m Acindar $17.890 (Easy, CAP-GBA)', source: 'https://www.easy.com.ar/hierro-redondo-adn-08mm-12mt---cap-gba/p' },
  'hydrofuge': { ars: 1995, sold: 'Sika 1 hidrófugo en pasta 20 kg $39.900 (Easy)', source: 'https://www.easy.com.ar/sika-1-en-pasta-x-20-kg/p' },
  'fill': { ars: 25000, sold: 'Tosca para relleno, typical $21.000/m³, range $14.000-30.000 (servidos.ar AMBA survey, Jul 2026, without freight)', source: 'https://servidos.ar/precio-materiales-construccion', estimate: true },
  'brick.solid': { ars: 269, sold: 'Ladrillo Común $269 per unit (Easy, web exclusive)', source: 'https://www.easy.com.ar/ladrillo-comun-1353270/p' },
  'brick.facing': { ars: 476, sold: 'Ladrillo visto x unidad $476 (Corralón Contino)', source: 'https://corraloncontinotienda.com/productos/ladrillos-comunes-x-unidad/' },
  'brick.hollow8': { ars: 699, sold: 'Ladrillo Hueco 08x18x33 Cerámica Marcos Paz $699 (Easy store e115)', source: 'https://www.easy.com.ar/e115-ladrillo-hueco-08x18x33-cmp/p' },
  'brick.hollow12': { ars: 919, sold: 'Ladrillo Hueco 12x18x33 Cerámica Marcos Paz $919 (Easy store e115)', source: 'https://www.easy.com.ar/e115-ladrillo-hueco-12x18x33-cmp/p' },
  'brick.hollow18': { ars: 1299, sold: 'Ladrillo Hueco 18x18x33 Cerámica Marcos Paz $1.299 (Easy store e115)', source: 'https://www.easy.com.ar/e115-ladrillo-hueco-18x18x33-cmp/p' },
  'slab.joists': { ars: 5104, sold: 'Vigueta pretensada Tensar 4,00 m $20.415 (Easy)', source: 'https://www.easy.com.ar/vigueta-tensar-4-0mt/p' },
  'slab.blocks': { ars: 1669, sold: 'Ladrillo Techo 12.5x25x42 Cerámica Marcos Paz $1.669 (Easy store e170)', source: 'https://www.easy.com.ar/e170-ladrillo-techo-12-5x25x42/p' },
  'slab.mesh': { ars: 4470, sold: 'Malla Q131 15x15 Ø5 2,40x6,00 m (14.4 m²) $91.233 (perfiles.com.ar, San Fernando); Easy Q84 15x15 Ø3.8 2x5 m (10 m²) $35.290', source: 'https://perfiles.com.ar/wp-json/wc/store/products?search=Malla&per_page=60', estimate: true },
  'lintel': { ars: 10000, sold: 'No AMBA listing found for a precast concrete lintel', source: 'https://www.easy.com.ar/vigueta-tensar-4-0mt/p', estimate: true },
  'eps': { ars: 12500, sold: 'Placa poliestireno 30 mm 15 kg/m³ 1x1 m Estisol $7.500 (Easy); 20 mm 20 kg/m³ $6.000-6.300; 50 mm 12 kg/m³ $8.740-8.850', source: 'https://www.easy.com.ar/plancha-pe-30mm-15kgm3-1206457/p', estimate: true },
  'polyethylene': { ars: 600, sold: 'Rollo polietileno negro 200 µm 4 x 50 m (200 m²) Maxhaus $119.900 (Easy)', source: 'https://www.easy.com.ar/rollo-polietileno-negro-4m-x-50m-200-mic/p' },
  'glasswool': { ars: 9557, sold: 'Isover Rolac Plata Cubierta HR 50 mm con aluminio 1,2 x 12 m (14.4 m²) $137.615 (Easy)', source: 'https://www.easy.com.ar/rolac-plata-cub-hr-50-mm-hc-1-2-x-12-mt-1363487/p' },
  'membrane': { ars: 7011, sold: 'Membrana asfáltica 4 mm aluminio 35 kg 10 m² Maxhaus $70.110 (Easy)', source: 'https://www.easy.com.ar/membrana-maxhaus-35kg-aluminio/p' },
  'roof.drain': { ars: 8415, sold: 'Embudo vertical PVC con reja 20x20 cm salida 110 mm Amanco $8.415 (Easy)', source: 'https://www.easy.com.ar/embudo-ver-pvc-20x20-110-reja-pla-amanc/p' },
  'coping': { ars: 10000, sold: 'Cupertina de muro chapa galvanizada, Mercado Libre: from $4.090 per 1 m strip up to $25.745 per 2 m, depending on gauge and width', source: 'https://listado.mercadolibre.com.ar/cupertina-de-muro-chapa-galvanizada', estimate: true },
  'purlin.c100': { ars: 8817, sold: 'Perfil C 100x40x15x1,60 mm 6 m galvanizado Ternium $52.900 (Easy)', source: 'https://www.easy.com.ar/perfil-c-100x40x15x1-60mmx6m-galv-/p' },
  'rafter.timber': { ars: 5409, sold: 'Tirante pino cepillado 2x6 x 3,66 m (Pindó) $19.796,50 (Easy)', source: 'https://www.easy.com.ar/tirante-cepillado-2x6x3-66-m-1277487/p' },
  'batten.timber': { ars: 2356, sold: 'Listón pino clear 1x2 x 2,00 m Victoria $4.712 (Easy)', source: 'https://www.easy.com.ar/liston-pino-clear-1-x-2-x-2-00-m-nc/p' },
  'gutter': { ars: 9002, sold: 'Canaleta moldura galvanizada Nº30 15 cm x 2 m Aurelio Gundín $18.003 (Easy)', source: 'https://www.easy.com.ar/canaleta-moldura-antigua-galv-nº30-15-cm/p' },
  'downpipe': { ars: 38100, sold: 'Tubo PVC 110 mm x 4 m Amanco standard $22.601,50 + 2 codos 45° 110 mm Amanco $4.760 each (Easy)', source: 'https://www.easy.com.ar/tubo-pvc-110-x-4m-standart-amanco/p' },
  'tube.galv.50x50': { ars: 11300, sold: 'Caño cuadrado 50x50x2,00 x 6 m (black) $56.308,19 at perfiles.com.ar (Ferrara SA, San Fernando)', source: 'https://perfiles.com.ar/product/cano-cuadrado-50x50x2-00x6mt/', estimate: true },
  'tube.galv.60x80': { ars: 14350, sold: 'Caño rectangular 60x80x2,00 x 6 m (black) $71.763,85 (Pall Metal, Merlo)', source: 'https://www.pall-metal.com.ar/collections/tubos-estructurales?page=3', estimate: true },
  'bar.glazing': { ars: 10080, sold: 'Caño rectangular 60x40x1,60 x 6 m (black) $50.385,36 (perfiles.com.ar)', source: 'https://perfiles.com.ar/wp-json/wc/store/products?search=60x40&per_page=50', estimate: true },
  'post.steel100': { ars: 23359, sold: 'Caño redondo 4" (Ø101,6) x 3,20 mm x 6 m $140.153,75 (perfiles.com.ar)', source: 'https://perfiles.com.ar/wp-json/wc/store/products?search=Redondo%204&per_page=50' },
  'beam.steel': { ars: 81297, sold: 'IPN 200 x metro $81.297,09 (perfiles.com.ar, price per m on a full 12 m bar)', source: 'https://perfiles.com.ar/product/ipn-200-x-mt/' },
  'post.shoe': { ars: 25415, sold: 'Base de columna para amurar negro 15x42,5x14 cm SC Metalúrgica $25.415 (Easy)', source: 'https://www.easy.com.ar/base-de-columna-p-amurar-viga-6x6/p' },
  'railing': { ars: 140000, sold: 'ML: stainless 304 glass-railing posts $56.000-115.000 each (30-70 cm tall); CristalFusion complete glass + stainless post system $310.000/m² (Córdoba)', source: 'https://cristalfusion.com.ar/baranda-vidrio-parante-acero-inox-2/', estimate: true },
  'paint.interior': { ars: 1850, sold: 'Albalatex interior blanco extra mate 20 l $185.000 (Easy)', source: 'https://www.easy.com.ar/latex-int-albalatex-20lt/p' },
  'paint.exterior': { ars: 1489, sold: 'Látex exterior blanco mate 20 l Casablanca $148.895 (Easy)', source: 'https://www.easy.com.ar/latex-ext-casablanca-20lt-1239394/p' },
  'coating.textured': { ars: 7826, sold: 'Tarquini Tarfiato Fino 25 kg (rinde 15 m²) $117.390 (Easy)', source: 'https://www.easy.com.ar/revestimiento-tarfiato-fino-aurora-x-25-kg-tarquini/p' },
  'pool.waterproofing': { ars: 4575, sold: 'Sika MonoTop-107 Seal 25 kg (rinde 12 m²) $54.900 (Easy)', source: 'https://www.easy.com.ar/sika-monotop-107-x-25kg/p' },
  'growlight': { ars: 70000, sold: 'ML \'led cultivo\' listings: full-spectrum 100 W lamp $70.000; Ulo Led Pro 100 W panel $68.220; Growtech 100 W FS kit $29.957', source: 'https://listado.mercadolibre.com.ar/led-cultivo-baratos', estimate: true },
  'growlight.rods': { ars: 11400, sold: 'Bandeja perforada galvanizada 100 mm x 3 m about $19.000 (servidos.ar, Nov 2026); varilla roscada 1/4" x 1 m TEL $5.305 (Easy)', source: 'https://servidos.ar/calculadora-bandeja-portacables', estimate: true },
  'material:stone-cladding': { ars: 18600, sold: 'Laja irregular San Juan natural stone, $18.600 per m2', source: 'https://brunorevestimientos.com.ar/lajas-irregulares' },
  'material:marble-white': { ars: 100000, sold: 'No natural white marble 60x60 listing found', source: 'https://listado.mercadolibre.com.ar/marmol-travertino-precio-m2', estimate: true },
  'material:granite-grey': { ars: 110000, sold: 'No Gris Mara 60x60 tile listing found. National granite 2 cm slab is quoted \'from about $215.000/m2\' (material only, Nov 2026).', source: 'https://servidos.ar/blog/cuanto-cuesta-mesada-granito-cuarzo-buenos-aires', estimate: true },
  'material:stone-slab': { ars: 12360, sold: 'Laja irregular San Luis, $12.360 per m2', source: 'https://brunorevestimientos.com.ar/lajas-irregulares' },
  'material:concrete-exposed': { ars: 4567, sold: 'Casablanca Protector Incoloro Hormigón 4 L, $63.933 ($52.837 before national taxes)', source: 'https://www.fravega.com/p/casablanca-protector-incoloro-hormigon-4-lts-rex-990238137/' },
  'material:concrete-polished': { ars: 16400, sold: 'Recuplast Microcemento en pasta gris 25 kg, $133.478,51 before national taxes (about $161.500 with IVA)', source: 'https://www.fravega.com/p/revestimiento-recuplast-microcemento-pasta-gris-25-kg-990225923/', estimate: true },
  'material:paving-concrete': { ars: 44500, sold: 'Adoquín hormigón Holanda 8 cm Tensolite, $890 each, 50 pieces/m2', source: 'https://www.easy.com.ar/adoquin-8cm-holando-ten--gris-e151/p' },
  'material:wood-oak': { ars: 113413, sold: 'Piso ingenieril Roble Marlborough 17(5) x 225 x 2430 mm, $113.413/m2, box 2.19 m2', source: 'https://www.miceli.com.ar/c/pisos/de-madera/' },
  'material:wood-walnut': { ars: 135751, sold: 'Piso ingenieril Lapacho Ipe 11(3) x 90 x 300-1200 mm, $135.751/m2, box 2.69 m2', source: 'https://www.miceli.com.ar/c/pisos/de-madera/' },
  'material:teak': { ars: 147875, sold: 'Piso/deck de lapacho macizo 19 x 65 mm, $147.875/m2, IVA and IIBB included', source: 'https://tienda.rolonpisos.com.ar/producto/deck-lapacho/' },
  'material:oak-solid': { ars: 396638, sold: 'Piso de madera maciza entablonado Roble Americano seleccionado 19 x 127 mm, $327.800/m2 + IVA, box 1.86 m2', source: 'https://www.arhomedesigns.com/productos/piso-de-madera-maciza-entablonado-roble-americano-seleccionado-19mm/' },
  'material:wood-deck': { ars: 255122, sold: 'Deck Lapacho Macizo 21 x 100 x 2100 mm, $255.122,24/m2 ($210.844,82 before national taxes)', source: 'https://www.milemor.com/shop/dck001-deck-lapacho-macizo-2081' },
  'material:tile-light': { ars: 17878, sold: 'Porcelanato Manhattan White H5 60x60 Cerámica Alberdi 1ra, $51.490 per box of 2.88 m2', source: 'https://www.blaisten.com.ar/pisos-y-revestimientos/ceramicas-y-porcelanatos/porcelanatos' },
  'material:tile-dark': { ars: 33630, sold: 'Porcelanato Negro Mármol Palladium 57.5x57.5 Tendenza, $55.490 per box', source: 'https://www.blaisten.com.ar/pisos-y-revestimientos/ceramicas-y-porcelanatos/porcelanatos' },
  'material:tile-terracotta': { ars: 9495, sold: 'Cerámico piso 36x36 Rojo Marruecos Mate Allpa, $25.446,60 per box of 2.68 m2 list ($9.495/m2; promo $7.596/m2)', source: 'https://www.easy.com.ar/piso-cer-marruecos-36x36-2-68-36/p' },
  'material:tile-checkered': { ars: 23900, sold: 'Mosaico calcáreo 20x20 blanco y negro (damero), about $20.900-23.900 per m2', source: 'https://listado.mercadolibre.com.ar/mosaicos-calcareos-blanco-y-negros' },
  'material:aluminium-black': { ars: 35000, sold: 'No reliable ACM 4 mm listing found', source: 'https://listado.mercadolibre.com.ar/placas-acm-aluminio-compuesto', estimate: true },
  'material:metal-standing-seam': { ars: 50000, sold: 'No junta alzada / engrafada listing found. Chapa prepintada is $21.000-36.000/m2 before IVA, material only (Nov 2026).', source: 'https://servidos.ar/calculadora-costo-techo', estimate: true },
  'material:metal-sheet': { ars: 16940, sold: 'Chapa acanalada C25 1.10 x 3.50 m Ternium, $59.290 per sheet', source: 'https://easy.com.ar/chapa-acanalada-c25-1-10x3-50mt-cu-1318146/p' },
  'material:polycarbonate': { ars: 27422, sold: 'Placa policarbonato alveolar 6 mm 2.10 x 1.45 m (Miolux), $83.500', source: 'https://www.easy.com.ar/policarbonato-alv-2-10x1-45m-6mm-cristal/p' },
  'material:roof-membrane': { ars: 8226, sold: 'Membrana líquida blanco mate con poliuretano Proclassic (Sherwin Williams) 20 kg, $137.095 list ($116.531 promo)', source: 'https://easy.com.ar/membrana-liquida-proclassic-blanca-20kg/p' },
  'material:roof-green': { ars: 60000, sold: 'No packaged green-roof system found', source: 'https://viveroagronomia.com.ar/tienda/', estimate: true },
  'material:gravel': { ars: 4654, sold: 'Bolsón piedra canto rodado 1300 kg Tarquini, $75.630', source: 'https://www.easy.com.ar/bolson-piedra-canto-rodado/p' },
  'material:mulch': { ars: 7687, sold: 'Chips de corteza de pino, 80 dm3 bag, $12.299', source: 'https://listado.mercadolibre.com.ar/vivero-hanasono' },
  'material:grass': { ars: 11929, sold: '10 m2 de grama bahiana en panes (Hanasono), $119.290', source: 'https://listado.mercadolibre.com.ar/vivero-hanasono' },
  'material:pool-stone': { ars: 37375, sold: 'Revestimiento venecita símil piedra Bali 10x10x1.7 (mix), $37.375 per m2', source: 'https://piscinasagui.com.ar/categoria-producto/baldosas-atermicas/' },
  'pool.lining': { ars: 22564, sold: 'Venecitas vítreas 2x2 Venetile, about $20.758-22.564 per m2 (mesh sheets)', source: 'https://listado.mercadolibre.com.ar/venecitas-precio-por-m2' },
  'skirting': { ars: 4106, sold: 'Zócalo MDF 10 cm prepintado blanco, $3.655-4.106 per m', source: 'https://listado.mercadolibre.com.ar/zocalos-madera-10-cm' },
  'door:single': { ars: 145513, sold: 'Puerta placa Camden 2 tableros rectos blanca 80 x 200 Oblak, marco chapa, $232.820', source: 'https://www.easy.com.ar/pta-placa-camden-2t-rec-mch-80-d/p' },
  'door:double': { ars: 341585, sold: 'Portada doble chapa Barmetal doble pintura final, $840.300 list', source: 'https://www.easy.com.ar/portada-doble-pintura-final-b-der-1356236/p', estimate: true },
  'door:sliding': { ars: 128000, sold: 'Ventana/puerta corrediza aluminio 200 x 200 Moderna Nexo, $512.000', source: 'https://www.easy.com.ar/v-v-ent-al-bl-corred-moderna-2-00x2-00/p' },
  'window:fixed': { ars: 126963, sold: 'Paño fijo 100x100 Módena vidrio entero V4, $126.962,88 ($104.928 before national taxes)', source: 'https://www.abershop.ar/MLA-678763855-pano-fijo-100x100-modena-vidrio-entero-v4-_JM' },
  'window:sliding': { ars: 167758, sold: 'Ventana aluminio 150 x 110 corrediza Nexo, $276.800', source: 'https://www.easy.com.ar/v-v-ent-al-bl-corred-moderna-1-50x1-10/p' },
  'window:double-hung': { ars: 300000, sold: 'No guillotina price found (Módena guillotina compensada 80x120 listed without price)', source: 'https://servidos.ar/calculadora-costo-ventanas', estimate: true },
  'window:awning': { ars: 171625, sold: 'Ventiluz aluminio Herrero 60x40 (Aluar), $41.190 list ($37.071 promo)', source: 'https://listado.mercadolibre.com.ar/ventiluz-de-aluminio-60-x-40' },
  'window:casement': { ars: 320000, sold: 'Módena raja de abrir 50x150 DVH 4/9/4, $325.077 (a DVH example; no simple-glass casement found)', source: 'https://servidos.ar/calculadora-costo-ventanas', estimate: true },
  'gate:single': { ars: 140000, sold: 'Puerta reja peatonal 0.80 x 2 m, $223.000-416.000 installed (Nov 2026)', source: 'https://servidos.ar/blog/cuanto-cuesta-poner-rejas-ventanas-porton-buenos-aires', estimate: true },
  'gate:double': { ars: 130000, sold: 'No current listing. servidos.ar says a two-leaf batiente costs about the same as a 3x2 sliding gate ($581.000-1.160.000 installed).', source: 'https://servidos.ar/blog/cuanto-cuesta-poner-rejas-ventanas-porton-buenos-aires', estimate: true },
  'gate:sliding': { ars: 138167, sold: 'Portón corredizo estilo americano 3 x 2 m con puerta de escape, $829.000', source: 'https://listado.mercadolibre.com.ar/portones-de-chapa' },
  'glass.tempered5': { ars: 93470, sold: 'Vidrio templado 5 mm incoloro por m2 a medida, $93.470 ($88.797 with 5% off)', source: 'https://listado.mercadolibre.com.ar/vidrio-templado-5-mm-precio-m2' },
  'glass.laminated33': { ars: 66821, sold: 'Vidrio laminado 3+3 incoloro (Blindex) por m2 a medida, $66.821', source: 'https://listado.mercadolibre.com.ar/vidrio-laminado-3-3-precio-m2' },
  'glass.laminated44': { ars: 96000, sold: 'Vidrio laminado 4+4 incoloro a medida, $96.000 per m2', source: 'https://listado.mercadolibre.com.ar/vidrio-laminado-4-4-precio-m2' },
  'glass.laminated55': { ars: 113000, sold: 'Vidrio laminado 5+5 incoloro a medida, $113.000 per m2', source: 'https://listado.mercadolibre.com.ar/herramientas-y-construccion/construccion/vidrio-laminado-5-5-precio-m2' },
  'column.roman': { ars: 400000, sold: 'No 2.7 m x 0.30 m listing found. Precast Toscana lisa 2.05 m is $275.000 and a corintia compuesta is $395.000 on Mercado Libre.', source: 'https://listado.mercadolibre.com.ar/columnas-romanas-de-cemento', estimate: true },
  'beam.stone': { ars: 120000, sold: 'No precast decorative beam listing found', source: 'https://servidos.ar/precio-materiales-construccion', estimate: true },
  'post.teak': { ars: 193500, sold: 'Madera maciza Lapacho importado, $23.295,88 per pie (board foot), $19.252,79 before national taxes (unit of the price not stated: may be high)', source: 'https://tienda.maderera.com.ar/ficha-2099-madera-lapacho-importado-4-maderera-llavallol', estimate: true },
  'beam.teak': { ars: 304050, sold: 'Lapacho importado, $23.295,88 per pie (board foot) (unit of the price not stated: may be high)', source: 'https://tienda.maderera.com.ar/ficha-2099-madera-lapacho-importado-4-maderera-llavallol', estimate: true },
  'rafter.teak': { ars: 138210, sold: 'Lapacho importado, $23.295,88 per pie (board foot) (unit of the price not stated: may be high)', source: 'https://tienda.maderera.com.ar/ficha-2099-madera-lapacho-importado-4-maderera-llavallol', estimate: true },
  'fireplace:masonry': { ars: 900000, sold: 'No masonry fireplace kit found. Parts: ladrillo refractario Fara 10 un $47.880 list; Ñuke flue/installation kit 108 cm 4" $284.995.', source: 'https://www.easy.com.ar/ladrillo-refractario-nro01-5un/p', estimate: true },
  'fireplace:parrilla': { ars: 970000, sold: 'Kit herraje reforzado 70x105 con elevación frontal y brasero, $684.000 (Mercado Libre)', source: 'https://listado.mercadolibre.com.ar/kit-parrilla-regulable', estimate: true },
  'counter': { ars: 369050, sold: 'Granite slab 2 cm \'from about $215.000/m2\' plus Bajo mesada Sorrento 120 cm Ricchezze $282.900 list', source: 'https://servidos.ar/blog/cuanto-cuesta-mesada-granito-cuarzo-buenos-aires', estimate: true },
  'counter:island': { ars: 480000, sold: 'Built up from the same granite and cabinet prices as counter', source: 'https://servidos.ar/blog/cuanto-cuesta-mesada-granito-cuarzo-buenos-aires', estimate: true },
  'sink:kitchen': { ars: 421979, sold: 'Johnson Luxor SI71 A single bowl, 71x48.2x21, $247.479,48 (IVA included) + FV Arizona kitchen monocomando $174.500 list', source: 'https://www.puntoceramico.com.ar/00060-bachas/1006-johnson-b-si71-a-luxor-compact-simp-71-x-482-x-21-sop-cestillo-c-antirrebalse.html' },
  'sink:bathroom': { ars: 284600, sold: 'Ferrum Venecia 48 cm lavatorio, $182.100 + FV Arizona lavatorio monocomando $102.500 list', source: 'https://www.easy.com.ar/_v/segment/routing/vtex.store@2.x/product/1340413/venecia-mes-48cm-l4v3j-x3a/p' },
  'sink:outdoor': { ars: 133740, sold: 'Pileta para lavadero Ferrum LP1-B 53x57x30, $110.100 + Canilla manga 1/2 FV, $19.537,20 before national taxes (about $23.640)', source: 'https://easy.com.ar/pileta-para-lavadero-lp010-b/p' },
  'bathtub:alcove': { ars: 499900, sold: 'Bañera anatómica 170 cm ABS con acrílico Bagnara, $499.900 list ($424.915 promo)', source: 'https://www.easy.com.ar/bañera-anatomica-abs-con-acrilico-170-1912127/p' },
  'bathtub:clawfoot': { ars: 1599999, sold: 'Bañera tipo antigua patas de león 170 x 75 acrílico blanca (Bañomanía), $1.599.999', source: 'https://www.shop.bmania.com.ar/MLA-816978990-banera-tipo-antigua-patas-de-leon-170-x-75-acrilico-blanca-_JM' },
  'bathtub:drop-in': { ars: 699000, sold: 'Casco acrílico Moderna blanco 170x80x41 recta (Bagnara), $699.000 list ($594.150 promo)', source: 'https://www.easy.com.ar/casco-acril-moderna-bco-170x80x41-recta/p' },
  'bathtub:corner': { ars: 1000000, sold: 'Only a jetted corner tub found: Bañera hidromasaje esquinera 130x130 acrílico 8 jets, $1.749.999 (Bañomanía)', source: 'https://www.mercadolibre.com.ar/tienda/banomania', estimate: true },
  'shower': { ars: 668900, sold: 'Receptáculo 80x80 Bagnara $241.900 list + Mampara curva 190x80 vidrio templado 6 mm Vessanti $263.000 list + FV Arizona ducha monocomando $164.000 list', source: 'https://www.easy.com.ar/receptaculo-abs-con-acrilico-80x80cm-1687367/p' },
  'toilet': { ars: 498000, sold: 'Inodoro con depósito doble descarga Bari Ferrum (kit with tank, lid, fixing ring and flexible hose), $498.000 list ($423.300 promo)', source: 'https://easy.com.ar/kit-bari-lgo-dep-asto-y-acc/p' },
  'bidet': { ars: 320900, sold: 'Bidet Bari 1 agujero Ferrum $156.900 list + FV Arizona bidet monocomando $164.000', source: 'https://easy.com.ar/bidet-bari-1a-bkm1-blanco/p' },
  'plant:olive': { ars: 55500, sold: 'Olivo, desde $55.500 (Vivero Agronomía, 20 L pot section)', source: 'https://viveroagronomia.com.ar/tamano/e20l/' },
  'plant:shrub': { ars: 18900, sold: 'Buxus (boj), $18.900', source: 'https://viveroagronomia.com.ar/tienda/plantas/plantas-de-exterior/agapanthus/' },
  'plant:bush': { ars: 18900, sold: 'Laurel de jardín (Nerium oleander), desde $18.900', source: 'https://viveroagronomia.com.ar/categoria-producto/plantas/plantas-de-exterior/arboles/' },
  'plant:agapanthus': { ars: 9500, sold: 'Agapanthus, 4 L or 10 L pot, $9.500 ($7.505 before taxes)', source: 'https://viveroagronomia.com.ar/tienda/plantas/plantas-de-exterior/agapanthus/' },
  'plant:lavender': { ars: 10500, sold: 'Lavanda, 3 L pot, $10.500 (Vivero Green Love)', source: 'https://viverogreenlove.ar/productos/lavanda/' },
  'plant:climber': { ars: 17000, sold: 'Jazmín de leche (Trachelospermum, climber), $17.000', source: 'https://viveroagronomia.com.ar/tienda/' },
  'tree:shade': { ars: 85700, sold: 'Tilo, 20 L pot, $85.700 (Vivero Agronomía)', source: 'https://viveroagronomia.com.ar/tamano/e20l/' },
  'tree:slender': { ars: 68000, sold: 'Ciprés Leylandii, 15 L pot, $68.000 (Vivero Mario)', source: 'https://tienda.viveromario.com.ar/productos/cipres-leylandii/' },
  // installations, for the Plumbing, Gas and Electricity tabs, and heating to compare
  'elec.conduit': { ars: 544, sold: 'Genrod corrugated 3/4" (light), 25 m roll, regular $13.590 (online $12.231)', source: 'https://www.easy.com.ar/corrugado-genrod-liviano-20mmx25m/p' },
  'elec.cable15': { ars: 893, sold: 'Prysmian Pirastic 1.5 mm2, 100 m roll, regular $89.290 (online $80.361)', source: 'https://easy.com.ar/unipol-1-5ce-pirastic-x-100-m/p' },
  'elec.cable25': { ars: 1417, sold: 'Prysmian Pirastic 2.5 mm2, 100 m roll, $141.690', source: 'https://www.easy.com.ar/unipol--2-5ro-pirastic-x-100m/p' },
  'elec.cable4': { ars: 1844, sold: 'IMSA Plastix CF 4 mm2, 100 m roll, regular $184.390 (online $165.951)', source: 'https://easy.com.ar/unipol-4ro-plastix-cf--x100m/p' },
  'elec.feeder': { ars: 11383, sold: 'Kalop subterranean cable 2x10 mm2, sold per metre, $11.383 (pre-tax $9.407)', source: 'https://paternalsrl.com.ar/producto/cable-subterraneo-2x10mm-x-metro/' },
  'elec.box.octagonal': { ars: 2190, sold: 'AG Metalurgica large octagonal box, galvanised steel, $2.190', source: 'https://www.easy.com.ar/caja-liviana-octogonal-grande/p' },
  'elec.box.rect': { ars: 1990, sold: 'AG Metalurgica rectangular box 5x10x4 cm, semi-heavy galvanised steel, $1.990', source: 'https://easy.com.ar/caja-semipesada-rectangular/p' },
  'elec.outlet': { ars: 2795, sold: 'Jeluz Quadra assembled single outlet 10 A, white (frame, bastidor and module), $2.795', source: 'https://easy.com.ar/l-arm-platinum-1-toma-10a-bl/p' },
  'elec.switch': { ars: 3445, sold: 'Jeluz Cristal assembled single switch 10 A, white, $3.445', source: 'https://easy.com.ar/l-arm-1-interruptor-teclon-cristal-bl/p' },
  'elec.outlet20': { ars: 5495, sold: 'Jeluz Quadra assembled outlet 20 A, black (frame, bastidor and module), $5.495', source: 'https://www.easy.com.ar/l-arm-platinum-toma-20a-ng/p' },
  'elec.breaker': { ars: 14495, sold: 'SICA 2x20 A 6 kA MCB, $14.495', source: 'https://www.easy.com.ar/interruptor-termom-2x20-a-6-ka-sica/p' },
  'elec.mainbreaker': { ars: 12995, sold: 'SICA 2x40 A MCB, $12.995', source: 'https://www.easy.com.ar/interruptor-termom-2x40a-sica/p' },
  'elec.rcd': { ars: 51390, sold: 'SICA RCD 2x40 A 30 mA, regular $51.390 (online -15% $43.681,50)', source: 'https://www.easy.com.ar/interruptor-difer-2x40a-30ma--sica/p' },
  'elec.board': { ars: 60390, sold: 'Genrod Q-Energy flush modular enclosure, 24 poles, white, $60.390', source: 'https://www.easy.com.ar/gabinete-24p-p-embutir-q-energy-genrod/p' },
  'elec.earth': { ars: 49680, sold: 'Genrod copper earth rod 1/2" x 1500 mm, regular $34.390 (online $30.951) + Genrod tomacable 1/2" $6.790 + Genrod plastic inspection box 15x15 $8.500', source: 'https://www.easy.com.ar/jabalina-1-2-x-1-5m-genrod/p' },
  'elec.meterbox': { ars: 249995, sold: 'Binelli precast H21 concrete pilar for an overhead single-phase T1 32 A service, with meter box, galvanised mast, pipeta and 4-module box with door, $249.995', source: 'https://www.easy.com.ar/pilar-electricidad-acometida-aerea-t1/p' },
  'water.pipe20': { ars: 2950, sold: 'Acqua System Magnum PN20 20 mm, 4 m pipe, $11.800', source: 'https://www.easy.com.ar/ca%C3%B1o-fus-pn20-20mmx4m--acqua-system-/p' },
  'water.pipe25': { ars: 4250, sold: 'Acqua System Magnum PN20 25 mm, 4 m pipe, $17.000', source: 'https://www.easy.com.ar/ca%C3%B1o-fus-pn20-25mmx4m--acqua-system-/p' },
  'water.fittings': { ars: 1150, sold: 'Acqua System 20 mm elbow 90 deg $1.000; Acqua System 20 mm tee $1.300', source: 'https://www.easy.com.ar/codo-normal-90°-fus-hh-20mm-acqua/p' },
  'water.valve': { ars: 27700, sold: 'Acqua System full-bore shut-off valve (llave de paso total) 20 mm, $27.700', source: 'https://www.easy.com.ar/llave-de-paso-fus-20mm-acqua/p' },
  'water.tank': { ars: 446100, sold: 'Rotoplas tricapa grey tank 1100 l, regular $446.100 (online -20% $356.880)', source: 'https://easy.com.ar/tanque-tricapa-gris-1100l-rotoplas/p' },
  'water.pump': { ars: 659999, sold: 'Rowa Tango SFL 20 pressure pump, Mercado Libre lowest of 10 sellers $659.999 (range $659.999 to $702.810), snapshot 2026-11-07', source: 'https://mejorescompras.com.ar/precio/MLA19699646--bomba-presurizadora-rowa-tango-sfl-20-4-duchas-en-simultaneo' },
  'water.heater': { ars: 699299, sold: 'Longvie T3150F gas water heater 150 l, Megatone $699.299', source: 'https://www.megatone.net/producto/termotanque-a-gas-longvie-150-litros-t31_MKT0094LON/' },
  'water.heater.electric': { ars: 955499, sold: 'Rheem TEP155 electric water heater 155 l, Mercado Libre $955.499, tracker updated 2026-11-08', source: 'https://mejorescompras.com.ar/precio/MLA23016358--termo-electrico-rheem-155-litros' },
  'drain.pipe110': { ars: 13975, sold: 'Amanco Nivel 1 PVC 110 x 3.2 mm, 4 m pipe, regular $55.900 (online $47.515)', source: 'https://www.easy.com.ar/tubo-pvc-110-x-3-2-x-4m-nivel-1-amanco/p' },
  'drain.pipe63': { ars: 9025, sold: 'Amanco Nivel 1 PVC 63 x 3.2 mm, 4 m pipe, regular $36.100 (online $30.685)', source: 'https://www.easy.com.ar/tubo-pvc-63-x-3-2-x-4m-nivel-1-amanco/p' },
  'drain.pipe50': { ars: 7050, sold: 'Amanco Nivel 1 PVC 50 x 3.2 mm, 4 m pipe, regular $28.200 (online $23.970)', source: 'https://www.easy.com.ar/tubo-pvc-50-x-3-2-x-4m-nivel-1-amanco/p' },
  'drain.trap': { ars: 12500, sold: 'Amanco PVC floor trap (pileta de patio), 5 entries, with 10x10 plastic grille, regular $12.500 (online $10.625)', source: 'https://easy.com.ar/pileta-pat-5e-c-reja-10x10-plast-amanco/p' },
  'drain.chamber': { ars: 93366, sold: 'Precast concrete inspection chamber 60x60x40 with lids, Ropelato $93.365,68', source: 'https://www.ropelato.com.ar/instalaciones-de-agua-y-sanitarias/100830-1054614-Camara-de-inspeccion-con-tapas-60x60x40.html' },
  'drain.septic': { ars: 1493800, sold: 'Rotoplas biodigestor 1300 l, regular $1.493.800 (online -20% $1.195.040)', source: 'https://easy.com.ar/v-p-biodigestor-1300-lt-/p' },
  'rain.box': { ars: 48300, sold: 'Duratop X 20x20 cm kit (portamarco, frame and plastic grille), 160 mm, polypropylene, regular $48.300 (online $41.055)', source: 'https://easy.com.ar/kit-de-reja-plast--20x20-cm-160-mm-dtopx/p' },
  'gas.pipe': { ars: 7700, sold: 'Sigas Thermofusion 20 mm gas pipe (PE-aluminium-PE), 4 m, regular $30.800 (online $26.180)', source: 'https://easy.com.ar/tubo-20-mm-x-4-m-sigas/p' },
  'gas.fittings': { ars: 5250, sold: 'Sigas 20 mm elbow 90 deg, regular $3.700 (online $3.145); Sigas 20 mm tee, regular $6.800 (online $5.780)', source: 'https://easy.com.ar/codo-a-90%C2%BA-20-mm-sigas/p' },
  'gas.valve': { ars: 19000, sold: 'Valforte gas valve 1/2", quarter-turn handle, $19.000', source: 'https://www.easy.com.ar/llave-conica-p-gas-c-campana-1-2/p' },
  'gas.meterbox': { ars: 231830, sold: 'Metalgas gas cabinet 60x40x30 cm, steel sheet, regular $147.430 (online $125.315,50) + Dintecnica domestic natural-gas regulator kit 6 m3/h 3/4" x 1 1/4" $84.400', source: 'https://www.easy.com.ar/gabinete-chapa-60x40x30-puerta-pintada-1287547/p' },
  'gas.bottled': { ars: 600000, sold: 'Arquimodulos precast cabinet for 2 x 45 kg cylinders, Mercado Libre about $445.000-569.000 (search snippets; one older listing $979.467) + 45 kg regulator with flexibl…', source: 'https://listado.mercadolibre.com.ar/gabinete-para-tubos-de-gas-45-kg', estimate: true },
  'gas.vent': { ars: 2990, sold: 'Metalgas enamelled ventilation grille 15x15 cm, regular $2.990 (online $2.541,50)', source: 'https://www.easy.com.ar/rejilla-ventilacion-esmaltada-15x15-1287553/p' },
  'gas.flue': { ars: 10873, sold: 'El Fontanero galvanised round vent pipe 100 mm x 3 m, regular $32.620 (online $27.727)', source: 'https://www.easy.com.ar/ca%C3%B1o-chapa-galv-p-vent-red-100mmx3m-k/p' },
  'gas.cap': { ars: 23470, sold: 'Aurelio Gundin 100 mm flue cap (sombrerete), grey, regular $23.470 (online $19.949,50)', source: 'https://easy.com.ar/sombrero-gas-d-a-c-torn-sep-100-aprobado/p' },
  'heat.split': { ars: 799999, sold: 'BGH inverter split 3000 frigorias heat/cool, class A (AIR3536BGH), Megatone $799.999 without installation', source: 'https://www.megatone.net/producto/aire-acondicionado-split-frio-calor-de-3000-frigorias-inverter-bgh_AIR3536BGH/' },
  'heat.boiler': { ars: 2910680, sold: 'Peisa Prima Tec 24 DS F GN, 24.000 kcal/h, combi (heating + hot water), forced draught, natural gas, Climatecnica AR$2.910.680', source: 'https://www.climatecnica.com/caldera-mural-peisa-prima-tec.72.1458.html' },
  'heat.radiator': { ars: 434532, sold: 'Peisa Tropical 500/80 aluminium, $56.628 per element x 6 = $339.768 + Peisa manual valve and lockshield set, angle 1/2", $62.291 + universal aluminium radiator kit (re…', source: 'https://www.climatecnica.com/calefacci-n_radiadores_radiadores.25.html' },
  'heat.underfloor': { ars: 31900, sold: 'Peisa Ofitt PE-Xb EVOH 16x2.0 pipe, 240 m roll $749.188; Peisa Ofitt 10 mm insulating sheet, 20 m2 roll $93.436; Ofitt PG1 6-circuit manifold $495.382; Saladillo manif…', source: 'https://www.climatecnica.com/calefacci-n_pisos-radiantes.18.html' },
  'heat.heater': { ars: 399995, sold: 'Emege Euro TB/TBU 2135 balanced-flue heater, 3500 kcal/h, efficiency class A, $399.995', source: 'https://easy.com.ar/calefactor-tb-3-5-kcal-emege-gn-ge-2135/p' },
  'heat.pump': { ars: 6500000, sold: 'No 9 kW air-water heat pump found priced in ARS. Nearest: Midea M-Thermal R32 16 kW 220 V (MHC-V16WD2N8-C), Climatecnica AR$9.336.634', source: 'https://www.climatecnica.com/bombas-de-calor-midea-m-thermal-r-32.72.1414.html', estimate: true },
  'cooker': { ars: 789999, sold: 'Florencia 5558 \'Bigas\' gas cooker, 56 cm, 4 burners, Megatone $789.999', source: 'https://www.megatone.net/listado/electrodomesticos/cocinas-hornos/cocinas/' },
}

/** Rows priced by another row's price: the same thing used in two places. */
const SAME: Record<string, string> = {
  'eps.wall': 'eps',
  'eps.roof': 'eps',
  'barrier.wall': 'polyethylene',
  'barrier.floor': 'polyethylene',
  'glasswool.roof': 'glasswool',
  'roof.membrane': 'membrane',
  'glass.railing': 'glass.laminated55',
  'glass.glazed': 'glass.tempered5',
  'glass.skylight': 'glass.laminated44',
  'glass.roof': 'glass.laminated33',
  'tube.glazed.post': 'tube.galv.50x50',
  'tube.glazed.rail': 'tube.galv.60x80',
}

/** The key a row is priced by, from its key and parameters; null for rows that are work, not bought. */
export function priceKey(row: TakeoffRow): string | null {
  const { key, params: p } = row
  if (['floor', 'cladding', 'ceiling', 'soffit.eaves', 'roof.cover', 'garden.cover'].includes(key)) return p.material ? `material:${p.material}` : null
  if (key === 'pool.lining') return p.material ? `material:${p.material}` : 'pool.lining'
  if (key === 'door' || key === 'window' || key === 'gate') return `${key}:${p.style}`
  if (key === 'paint') return `paint.${p.side}`
  if (key === 'fireplace') return `fireplace:${p.style}`
  if (key === 'counter') return p.style ? `counter:${p.style}` : 'counter'
  if (key === 'fixture' || key === 'plant') return p.style ? `${p.kind}:${p.style}` : p.kind!
  return SAME[key] ?? key
}

/** What one unit of a row costs (one door of its size), and the price it comes from; null when it has none. */
export function unitPrice(row: TakeoffRow): { ars: number; price: Price } | null {
  const k = priceKey(row)
  const price = k ? PRICES[k] : undefined
  if (!price) return null
  const perOpening = row.key === 'door' || row.key === 'window' || row.key === 'gate'
  return { ars: perOpening ? price.ars * row.params.w! * row.params.h! : price.ars, price }
}

/** How many of a row are bought: counts and bags whole. */
export const bought = (row: TakeoffRow): number => (row.unit === 'u' || row.unit === 'bags' ? Math.ceil(row.quantity - 1e-9) : row.quantity)

/** What a row costs: its unit price times what is bought; null when it has no price. */
export function rowCost(row: TakeoffRow): number | null {
  const u = unitPrice(row)
  return u ? u.ars * bought(row) : null
}
