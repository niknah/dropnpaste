import js from "@eslint/js";
import globals from "globals";



export default [
    js.configs.recommended,
    {
        rules: {
            "no-unused-vars": "warn"
        },
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "script",
	    globals: {
	    	...globals.browser
	    }
        }
    }
];
