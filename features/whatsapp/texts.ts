/**
 * Textos FIJOS del bot (español). Son avisos de error y de sistema que no se personalizan; los
 * mensajes del flujo normal (bienvenida, pago, estados…) son plantillas editables por el comercio
 * (message_template_defaults / tenant_messages).
 */
export const TEXT = {
  noCatalog: "Todavía no tenemos un catálogo publicado. Escríbenos más tarde o pide hablar con un asesor.",
  noProducts: "No hay productos disponibles en esta opción por ahora.",
  pickProduct: "Elige un producto para ver el detalle:",
  seeProducts: "Ver productos",
  askForQuote: "Consulta el precio con un asesor",
  openCatalog: "Ver catálogo",
  alwaysOpen: "Todos los días, a toda hora",
  confirm: "Confirmar",
  cancel: "Cancelar",
  delivery: "Delivery",
  pickup: "Retiro en local",
  cartCancelled: "Listo, cancelamos tu pedido. Cuando quieras empezar de nuevo, escríbenos.",
  cartEmpty: "Tu pedido está vacío. Elige tus productos en el catálogo.",
  orderUnavailable: "Algunos productos ya no están disponibles. Vuelve a elegirlos desde el catálogo.",
  sendLocationButton: "Enviar ubicación",
  askPaymentMethod: "¿Con qué método vas a pagar?",
  genericError: "Tuvimos un problema procesando tu mensaje. Inténtalo de nuevo en un momento.",
  proofAsk: "Envía una captura del comprobante o el número de referencia del pago.",
  proofBad: "No pudimos recibir ese archivo. Envía una imagen (JPG, PNG o WEBP) o un PDF de hasta 10 MB, o escribe el número de referencia.",
  orderExpired: "Tu pedido venció porque no recibimos el pago a tiempo. Puedes hacer uno nuevo desde el catálogo.",
  orderCancelled: (orderNumber: number) => `Tu pedido #${orderNumber} fue cancelado.`,
  receivedYes: "Ya lo recibí",
  alreadyDelivered: "Gracias, ya registramos que recibiste tu pedido.",
  inReview: (orderNumber: number) => `Seguimos validando el pago de tu pedido #${orderNumber}. Te avisamos en cuanto esté listo.`,
  orderStatus: (orderNumber: number, status: string) => `Tu pedido #${orderNumber} está: ${status}.`,
} as const;
