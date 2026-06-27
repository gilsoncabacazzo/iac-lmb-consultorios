import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const TABLA_CONSULTORIOS = process.env.TABLA_CONSULTORIOS || "docfy-consultorios";

export const handler = async (event) => {
  console.log("🚨 Evento recibido:", JSON.stringify(event));
  
  const httpMethod = event.httpMethod || event.requestContext?.http?.method;
  const pathParameters = event.pathParameters || {};
  
  // Capturamos el rol que viene de Cognito solo para controles de acceso
  const userRole = event.requestContext?.authorizer?.claims?.['custom:role'] || "MEDICO";

  try {
    // ========================================================
    // 🏢 1. INSERTAR CONSULTORIO (POST)
    // ========================================================
    if (httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      
      // 🔥 VALIDACIÓN CRÍTICA: Validamos que venga el ID de tu tabla de usuarios
      if (!body.usuarioId) {
        return respuesta(400, { message: "Error: No se recibió el ID de usuario del sistema." });
      }

      if (!body.nombre || !body.direccion || !body.ciudad || !body.celular) {
        return respuesta(400, { message: "Faltan campos obligatorios." });
      }

      const escaneo = await docClient.send(new ScanCommand({ TableName: TABLA_CONSULTORIOS }));
      const total = (escaneo.Items || []).length;
      const siguienteNumero = String(total + 1).padStart(3, '0'); // Ej: "001", "002"

      // 🔥 CREAMOS LA LISTA ÚNICA 'Usuarios'
      // Usamos un Set para asegurar que no se dupliquen IDs si ya venía en el body
      const usuariosSet = new Set(body.Usuarios || []);
      usuariosSet.add(body.usuarioId); // ◄ Vinculamos al creador de forma obligatoria

      // ⏳ LEER DÍAS DE TRIAL DESDE VARIABLES DE ENTORNO
      // parseInt convierte el string de la variable a número. Si no existe, usa 30 por defecto.
      const DIAS_TRIAL = parseInt(process.env.DIAS_TRIAL, 10) || 30; 
    
      const fechaActual = new Date();
      const fechaFinTrial = new Date();
      fechaFinTrial.setDate(fechaActual.getDate() + DIAS_TRIAL);

      const nuevoConsultorio = {
        id: `CONS-${siguienteNumero}`,
        nombre: body.nombre,
        direccion: body.direccion,
        ciudad: body.ciudad,
        lineaBaja: body.lineaBaja || "",
        celular: body.celular,
        usuarioId: body.usuarioId, // ◄ Guardado directo con el ID de tu tabla interna de usuarios
        Usuarios: Array.from(usuariosSet), // ◄ Guardado como la lista plana de IDs de Dynamo
        // 💳 OBJETO DE SUSCRIPCIÓN ENCAPSULADO
        InfoSuscripcion: {
            estado: "TRIAL",
            fechaInicio: fechaActual.toISOString(),
            fechaFin: fechaFinTrial.toISOString(),
            ultimaFechaPago: fechaActual.toISOString() // Inicializa con la fecha de alta
        },
        fechaCreacion: new Date().toISOString(),
        fechaActualizacion: new Date().toISOString()
      };

      await docClient.send(new PutCommand({
        TableName: TABLA_CONSULTORIOS,
        Item: nuevoConsultorio
      }));

      return respuesta(201, { message: "Consultorio creado con éxito", consultorio: nuevoConsultorio });
    }

    // ========================================================
    // 📋 2. LISTAR CONSULTORIOS (GET)
    // ========================================================
    if (httpMethod === "GET") {
      // Podemos recibir el usuarioId por Query String Parameters si el frontend quiere filtrar (ej: /consultorios?usuarioId=USR-123)
      const queryParams = event.queryStringParameters || {};
      const filtroUsuarioId = queryParams.usuarioId;

      const resultado = await docClient.send(new ScanCommand({
        TableName: TABLA_CONSULTORIOS
      }));

      let lista = resultado.Items || [];

      // 🔍 Si pasaron un usuarioId específico para filtrar en este CRUD:
      if (filtroUsuarioId) {
        lista = lista.filter(c => Array.isArray(c.Usuarios) && c.Usuarios.includes(filtroUsuarioId));
      } else if (userRole !== "ADMIN" && userRole !== "SECRETARIA") {
         // Protección por defecto si un médico intenta listar todo sin pasar su ID
         return respuesta(403, { message: "No tienes permisos para listar todos los consultorios." });
      }

      return respuesta(200, lista);
    }

    // ========================================================
    // 🔄 3. ACTUALIZAR CONSULTORIO (PUT)
    // ========================================================
    if (httpMethod === "PUT") {
      const idConsultorio = pathParameters.id;
      if (!idConsultorio) {
        return respuesta(400, { message: "Se requiere el ID del consultorio." });
      }

      const body = JSON.parse(event.body || "{}");

      const updateExpression = [];
      const expressionAttributeNames = {};
      const expressionAttributeValues = {};

      // Permitimos actualizar datos del consultorio, pero el usuarioId original NO se toca
    // Dentro del bloque if (httpMethod === "PUT") de tu Lambda:
      const camposPermitidos = ["nombre", "direccion", "ciudad", "lineaBaja", "celular", "InfoSuscripcion"];      
      
      camposPermitidos.forEach(campo => {
        if (body[campo] !== undefined) {
          updateExpression.push(`#${campo} = :${campo}`);
          expressionAttributeNames[`#${campo}`] = campo;
          expressionAttributeValues[`:${campo}`] = body[campo];
        }
      });

      if (updateExpression.length === 0) {
        return respuesta(400, { message: "No hay campos para actualizar." });
      }

      updateExpression.push("#fechaActualizacion = :fechaActualizacion");
      expressionAttributeNames["#fechaActualizacion"] = "fechaActualizacion";
      expressionAttributeValues[":fechaActualizacion"] = new Date().toISOString();

      const resultado = await docClient.send(new UpdateCommand({
        TableName: TABLA_CONSULTORIOS,
        Key: { id: idConsultorio },
        UpdateExpression: `SET ${updateExpression.join(", ")}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: "ALL_NEW"
      }));

      return respuesta(200, { message: "Consultorio actualizado", consultorio: resultado.Attributes });
    }

    return respuesta(405, { message: "Método no permitido." });

  } catch (error) {
    console.error("🚨 Error:", error);
    return respuesta(500, { message: "Error interno", error: error.message });
  }
};

const respuesta = (statusCode, body) => {
  return {
    statusCode,
    body: JSON.stringify(body)
  };
};