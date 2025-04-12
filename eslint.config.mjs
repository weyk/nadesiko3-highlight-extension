// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import mochaPlugin from 'eslint-plugin-mocha'

export default [
	{
		ignores: [
			"node_modules/",
			".test/",
			".build/",
			"lib/",
			"**/*.mjs"
		]
	},
	mochaPlugin.configs.flat.recommended,
	tseslint.config(
		eslint.configs.recommended,
		tseslint.configs.strict,
		tseslint.configs.stylistic,
		{
			files: [
			"**/*.mts",
			"**/*.cts",
			"**/*.ts"
			]
		}
    ),

]

/*
import stylisticTs from '@stylistic/eslint-plugin-ts'
import typescriptParser from '@typescript-eslint/parser'
{
        languageOptions: {
            parser: typescriptParser
        },
		plugins: {
			'@stylistic/ts': stylisticTs
		},
		rules: {
			'@stylistic/ts/semi': ["error", "never"],
			// '@stylistic/no-unused-vars': "off",
			'@stylistic/ts/no-explicit-any': "off",
			'@stylistic/ts/explicit-module-boundary-types': "off",
			'@stylistic/ts/no-non-null-assertion': "off",
			'mocha/no-mocha-arrows': "off"
		},
	}
]
*/
