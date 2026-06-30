import js from "@eslint/js";
import globals from "globals";

export default [
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                ...globals.node,
                // Agrega aquí variables globales si tu entorno inyecta alguna de forma externa
            },
        },
        rules: {
            "no-undef": "error",       // <-- ESTO detendrá el pipeline si 'responder' no está declarada
            "no-unused-vars": "warn",   // Te avisa si declaras variables que no usas
        },
    },
];