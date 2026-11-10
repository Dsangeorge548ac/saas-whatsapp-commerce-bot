# Correos de Astra (plantillas de Supabase Auth)

La app no envía estos correos: los envía **Supabase Auth**. Hay que pegar cada plantilla en el panel de Supabase
(proyecto `whatsapp-commerce-bot`) → **Authentication → Emails → Templates**. Todas usan un **código de 6 dígitos**
(`{{ .Token }}`), no enlaces mágicos: así funcionan igual en local y en Vercel.

| Plantilla en Supabase | Archivo | Asunto sugerido | Cuándo se envía |
|---|---|---|---|
| **Confirm signup** | `confirm-signup.html` | `Your Astra verification code` | Al crear la cuenta (dueño u operador invitado). Se escribe en `/verify`. |
| **Reset password** | `reset-password.html` | `Reset your Astra password` | "Forgot password?" en `/forgot-password`. |
| **Change email address** | `change-email.html` | `Confirm your new Astra email` | Cambio de correo desde `/profile` (llega al correo NUEVO). |

## Pasos

1. **SMTP propio** (Authentication → Emails → SMTP Settings). El correo de prueba de Supabase solo envía unos
   pocos mensajes por hora y solo a miembros del equipo del proyecto: sin SMTP los códigos no llegan a los usuarios.
2. **Site URL** (Authentication → URL Configuration): la URL de la app (`http://localhost:3000` en local, el
   dominio real en producción). Los botones "Open Astra" la usan (`{{ .SiteURL }}`).
3. Pega cada archivo en su plantilla (pestaña *Source*), pon el asunto y guarda.
4. **Secure email change** (Authentication → Providers → Email): desactívalo. La app confirma el cambio de correo
   con el código que llega al correo NUEVO; con la opción activa, Supabase también exige un código del correo
   anterior y el cambio quedaría a medias.

## Variables que usan las plantillas

- `{{ .Token }}`: el código de 6 dígitos (obligatorio; sin él el usuario no puede verificar).
- `{{ .Data.first_name }}`: el nombre que la persona escribió al registrarse (si no hay, el saludo lo omite).
- `{{ .NewEmail }}`: solo en *Change email address*, el correo nuevo.
- `{{ .SiteURL }}`: la Site URL del paso 2.

Los enlaces del pie (Privacy, Terms) apuntan a `/legal/privacy` y `/legal/terms`, que existen en la app. Si cambias
la marca o los textos, edita estos archivos y vuelve a pegarlos: Supabase no los lee del repositorio.
