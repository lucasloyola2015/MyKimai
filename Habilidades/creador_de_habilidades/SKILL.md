---
name: Creador de Habilidades
description: Habilidad para crear nuevas habilidades personalizadas en español siguiendo el formato y estructura correctos
---

# Creador de Habilidades

Esta habilidad te permite crear nuevas habilidades personalizadas para Antigravity siguiendo el formato y estructura correctos.

## ¿Qué son las Habilidades?

Las habilidades son carpetas de instrucciones, scripts y recursos que extienden las capacidades de Antigravity para tareas especializadas. Cada carpeta de habilidad contiene:

- **SKILL.md** (requerido): El archivo de instrucciones principal con frontmatter YAML (nombre, descripción) e instrucciones detalladas en markdown

Las habilidades más complejas pueden incluir directorios y archivos adicionales según sea necesario, por ejemplo:
- **scripts/** - Scripts auxiliares y utilidades que extienden las capacidades
- **examples/** - Implementaciones de referencia y patrones de uso
- **resources/** - Archivos adicionales, plantillas o recursos que la habilidad puede referenciar

## Cuándo Crear una Habilidad

Crea una habilidad cuando:
- Tienes un flujo de trabajo repetitivo que requiere múltiples pasos
- Necesitas seguir un proceso específico de manera consistente
- Quieres documentar un procedimiento complejo para uso futuro
- Deseas compartir conocimiento especializado con otros usuarios

## Estructura del Archivo SKILL.md

El archivo `SKILL.md` debe seguir este formato:

```markdown
---
name: Nombre de la Habilidad
description: Breve descripción de lo que hace la habilidad
---

# Nombre de la Habilidad

Descripción detallada de la habilidad y su propósito.

## Cuándo Usar Esta Habilidad

Explica en qué situaciones se debe usar esta habilidad.

## Instrucciones

Proporciona instrucciones paso a paso claras y detalladas:

1. **Paso 1**: Descripción del primer paso
   - Detalles adicionales
   - Consideraciones importantes

2. **Paso 2**: Descripción del segundo paso
   - Ejemplos si es necesario
   - Advertencias o notas

3. **Paso 3**: Y así sucesivamente...

## Ejemplos

Proporciona ejemplos concretos de cómo usar la habilidad.

## Notas Adicionales

Cualquier información adicional, limitaciones o consejos.
```

## Cómo Crear una Nueva Habilidad

Cuando el usuario te pida crear una nueva habilidad, sigue estos pasos:

### 1. Recopilar Información

Pregunta al usuario:
- ¿Cuál es el propósito de la habilidad?
- ¿Qué problema resuelve?
- ¿Cuáles son los pasos principales del proceso?
- ¿Se necesitan scripts o recursos adicionales?

### 2. Determinar la Estructura

Decide si la habilidad necesita:
- Solo el archivo `SKILL.md` (para habilidades simples)
- Carpeta `scripts/` (si requiere automatización)
- Carpeta `examples/` (si necesita ejemplos de código o configuración)
- Carpeta `resources/` (si requiere plantillas, imágenes u otros archivos)

### 3. Crear el Frontmatter YAML

El frontmatter debe incluir:
```yaml
---
name: Nombre Descriptivo de la Habilidad
description: Descripción concisa de una línea sobre lo que hace la habilidad
---
```

**Reglas importantes:**
- El nombre debe ser claro y descriptivo
- La descripción debe ser breve pero informativa (máximo 1-2 líneas)
- Usa español para todo el contenido

### 4. Escribir las Instrucciones

Las instrucciones deben ser:
- **Claras y específicas**: Evita ambigüedades
- **Paso a paso**: Numera cada paso secuencialmente
- **Completas**: Incluye todos los detalles necesarios
- **Accionables**: Cada paso debe ser ejecutable
- **Bien formateadas**: Usa markdown para mejorar la legibilidad

### 5. Agregar Secciones Adicionales

Según la complejidad, incluye:
- **Prerrequisitos**: Lo que se necesita antes de usar la habilidad
- **Ejemplos**: Casos de uso concretos
- **Solución de Problemas**: Problemas comunes y soluciones
- **Referencias**: Enlaces a documentación relacionada

### 6. Crear Archivos Adicionales (si es necesario)

Si la habilidad requiere scripts:
```
Habilidades/
  nombre_habilidad/
    SKILL.md
    scripts/
      script_auxiliar.py
      otro_script.sh
```

Si necesita ejemplos:
```
Habilidades/
  nombre_habilidad/
    SKILL.md
    examples/
      ejemplo_basico.md
      ejemplo_avanzado.md
```

Si requiere recursos:
```
Habilidades/
  nombre_habilidad/
    SKILL.md
    resources/
      plantilla.json
      configuracion.yaml
```

## Mejores Prácticas

1. **Nombres de Archivos**: Usa minúsculas y guiones bajos para nombres de carpetas (ej: `mi_habilidad`)
2. **Idioma Consistente**: Mantén todo el contenido en español
3. **Formato Markdown**: Usa encabezados, listas, bloques de código y énfasis apropiadamente
4. **Claridad**: Escribe pensando en alguien que nunca ha usado la habilidad antes
5. **Mantenibilidad**: Estructura el contenido para que sea fácil de actualizar
6. **Ejemplos Concretos**: Incluye ejemplos reales siempre que sea posible
7. **Advertencias**: Destaca pasos críticos o potencialmente peligrosos

## Plantilla Base para Nuevas Habilidades

Usa esta plantilla como punto de partida:

```markdown
---
name: [Nombre de la Habilidad]
description: [Descripción breve de la habilidad]
---

# [Nombre de la Habilidad]

[Descripción detallada del propósito y alcance de la habilidad]

## Cuándo Usar Esta Habilidad

[Explica las situaciones en las que esta habilidad es útil]

## Prerrequisitos

- [Requisito 1]
- [Requisito 2]

## Instrucciones

### Paso 1: [Nombre del Paso]

[Descripción detallada del paso]

```bash
# Ejemplo de comando si aplica
comando --opcion valor
```

### Paso 2: [Nombre del Paso]

[Descripción detallada del paso]

### Paso 3: [Nombre del Paso]

[Descripción detallada del paso]

## Ejemplos

### Ejemplo 1: [Caso de Uso]

[Descripción del ejemplo]

```
[Código o configuración de ejemplo]
```

## Solución de Problemas

### Problema: [Descripción del problema]

**Solución**: [Cómo resolverlo]

## Notas Adicionales

- [Nota importante 1]
- [Nota importante 2]
```

## Proceso de Creación Paso a Paso

Cuando crees una habilidad, sigue este flujo:

1. **Analizar la solicitud** del usuario para entender qué necesita
2. **Determinar el nombre** descriptivo de la habilidad
3. **Crear la estructura de carpetas** necesaria
4. **Escribir el archivo SKILL.md** con:
   - Frontmatter YAML completo
   - Descripción clara del propósito
   - Instrucciones detalladas paso a paso
   - Ejemplos relevantes
   - Notas adicionales si son necesarias
5. **Crear archivos adicionales** si la habilidad los requiere (scripts, ejemplos, recursos)
6. **Revisar** que todo esté en español y bien formateado
7. **Verificar** que las instrucciones sean claras y completas

## Ubicación de las Habilidades

Las habilidades deben crearse en la carpeta `Habilidades/` dentro del workspace del usuario. La estructura típica es:

```
Habilidades/
  habilidad_1/
    SKILL.md
  habilidad_2/
    SKILL.md
    scripts/
      script.py
  creador_de_habilidades/
    SKILL.md
```

## Validación de Habilidades

Antes de finalizar, verifica que:

- [ ] El archivo `SKILL.md` existe y tiene el frontmatter YAML correcto
- [ ] El nombre y descripción son claros y descriptivos
- [ ] Las instrucciones están en español
- [ ] Los pasos están numerados y son secuenciales
- [ ] Hay ejemplos cuando son necesarios
- [ ] El formato markdown es correcto
- [ ] Todos los archivos adicionales están en las carpetas correctas
- [ ] No hay errores de ortografía o gramática

## Ejemplo Completo

Aquí hay un ejemplo de una habilidad simple:

```markdown
---
name: Configurar Entorno de Desarrollo Python
description: Guía para configurar un entorno de desarrollo Python con virtualenv y dependencias
---

# Configurar Entorno de Desarrollo Python

Esta habilidad te guía a través del proceso de configuración de un entorno de desarrollo Python aislado usando virtualenv.

## Cuándo Usar Esta Habilidad

Usa esta habilidad cuando:
- Inicies un nuevo proyecto Python
- Necesites aislar dependencias de diferentes proyectos
- Quieras mantener tu sistema Python limpio

## Prerrequisitos

- Python 3.7 o superior instalado
- pip instalado
- Acceso a terminal/línea de comandos

## Instrucciones

### Paso 1: Crear el Entorno Virtual

Navega a tu directorio de proyecto y ejecuta:

```bash
python -m venv venv
```

Esto creará una carpeta `venv` con el entorno virtual.

### Paso 2: Activar el Entorno Virtual

**En Windows:**
```bash
venv\Scripts\activate
```

**En Linux/Mac:**
```bash
source venv/bin/activate
```

Verás `(venv)` en tu prompt cuando esté activado.

### Paso 3: Instalar Dependencias

Si tienes un archivo `requirements.txt`:

```bash
pip install -r requirements.txt
```

O instala paquetes individuales:

```bash
pip install nombre_paquete
```

### Paso 4: Verificar la Instalación

Verifica que todo esté instalado correctamente:

```bash
pip list
```

## Ejemplos

### Ejemplo 1: Proyecto Django

```bash
python -m venv venv
venv\Scripts\activate  # Windows
pip install django
django-admin startproject miproyecto
```

## Solución de Problemas

### Problema: "python no se reconoce como comando"

**Solución**: Asegúrate de que Python esté en tu PATH del sistema.

### Problema: Error de permisos al instalar paquetes

**Solución**: Asegúrate de que el entorno virtual esté activado antes de instalar.

## Notas Adicionales

- Siempre activa el entorno virtual antes de trabajar en tu proyecto
- Usa `deactivate` para salir del entorno virtual
- Agrega `venv/` a tu `.gitignore`
```

## Consejos Finales

- **Sé específico**: Cuanto más detalladas sean las instrucciones, más útil será la habilidad
- **Piensa en el usuario**: Escribe como si estuvieras explicando a alguien que no conoce el proceso
- **Mantén actualizado**: Revisa y actualiza las habilidades cuando cambien los procesos
- **Documenta todo**: Si algo puede ser confuso, agrégalo a la documentación
- **Usa ejemplos reales**: Los ejemplos concretos son más útiles que los abstractos
