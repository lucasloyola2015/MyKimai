# Política de Seguridad

## 🔒 Protección de Secretos

### ⚠️ IMPORTANTE: Tokens y Credenciales

**NUNCA** subas los siguientes archivos o información al repositorio:

- `.env.local`
- `.env`
- Personal Access Tokens (PAT) de GitHub
- Claves de API
- Credenciales de Supabase
- Cualquier información sensible

### Archivos Protegidos

Los siguientes archivos están en `.gitignore` y NO se subirán al repositorio:

- `.env*.local`
- `.env`
- `*.key`
- `*.pem`
- `secrets/`

### Si Expusiste un Token

Si accidentalmente expusiste un Personal Access Token o credencial:

1. **REVÓCALO INMEDIATAMENTE** en la plataforma correspondiente:
   - GitHub: Settings → Developer settings → Personal access tokens
   - Supabase: Project Settings → API

2. **Crea un nuevo token** con los permisos mínimos necesarios

3. **Actualiza** el archivo `.env.local` con el nuevo token

4. **Verifica** que el token antiguo no esté en el historial de commits:
   ```bash
   git log --all --full-history -- .env.local
   ```

### Buenas Prácticas

- ✅ Usa `.env.example` para documentar variables necesarias
- ✅ Usa variables de entorno en Vercel/plataformas de deploy
- ✅ Revisa los archivos antes de hacer commit
- ✅ Usa tokens con permisos mínimos necesarios
- ❌ NO compartas tokens en chats, emails o documentos públicos
- ❌ NO hardcodees credenciales en el código

### Variables de Entorno en Producción

Para deployment en Vercel:

1. Ve a tu proyecto en Vercel
2. Settings → Environment Variables
3. Agrega las variables necesarias
4. Los valores se inyectan automáticamente en el build
