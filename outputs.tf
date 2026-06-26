output "lambda_arn" {
  description = "ARN de la función Lambda de Obtener Maestros"
  # 🎯 Cambiamos 'registro_usuario' por 'obtener_maestros'
  value       = aws_lambda_function.registro_consultorio.arn
}

output "lambda_function_name" {
  description = "Nombre de la función Lambda de Obtener Maestros"
  # 🎯 También si tenías este output, actualizalo acá
  value       = aws_lambda_function.registro_consultorio.function_name
}