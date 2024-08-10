import stylisticTs from '@stylistic/eslint-plugin-ts'
import mochaPlugin from 'eslint-plugin-mocha'
import typescriptParser from '@typescript-eslint/parser'

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
		files: [
			"**/*.mts",
			"**/*.cts",
			"**/*.ts"
		]
	}
]
