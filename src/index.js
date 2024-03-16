import {stripIndent} from 'common-tags'
import {parse} from 'csv-parse'
import {stringify} from 'csv-stringify'
import dayjs from 'dayjs'
import * as R from 'ramda'
import * as T from 'stream-transforms'
import yargs from 'yargs'
import {hideBin} from 'yargs/helpers'

import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import {pipeline} from 'node:stream/promises'
import {setTimeout} from 'node:timers/promises'

import {chat, openAIClient} from './openai.js'

const getParseOptions = (argv) => {
	// const {limit, skip} = argv
	const parseOptions = {columns: true, trim: true, bom: true}
	// if (limit) {
	// 	parseOptions.to = parseInt(limit)
	// }
	// if (skip) {
	// 	parseOptions.from = parseInt(skip)
	// }
	return parseOptions
}

const yargv = await yargs(hideBin(process.argv))
const argv = yargv
	.usage('$0 [options]', stripIndent`
		Process a batch of OpenAI chat completion requests. The requests must be specified in a csv file <infile> with
		two fields named "system" and "user". The contents of these fields will be used as the content of the system
		message and the user message sent to OpenAI as part of the chat completion request. Results will be written to
		<outfile> which will be a csv containing the fields "system", "user", and "assistant" with the response from
		OpenAI contained in the "assistant" field.
		
		Any additional fields specified in the input file will have no effect on processing and will be copied to the
		output file without modification.

		Please make sure to specify your OpenAI API key in an environment variable called OPENAI_APIKEY.
		This can also be done by adding a file called .env to your working directory and including a line like this:
		
		OPENAI_APIKEY=<Your OpenAI API key>
		
		Please note that the order of the records in the output file may not match the order in the input file.
		Therefore, you may find it helpful to add an additional index field to the input file. This will be copied
		to the output file and may aid in sorting and matching the results.
	`)
	.options({
		infile: {type: 'string', alias: 'i', requiresArg: true, demandOption: true, describe: 'Path to input file.'},
		outfile: {type: 'string', alias: 'o', requiresArg: true, describe: 'Path to output file.\nIf not specified outfile name will be <infile>_out_<datetime>.csv.'},
		concurrency: {type: 'number', alias: 'c', requiresArg: true, default: 3, describe: 'Maximum number of simultaneous calls allowed to OpenAI.'},
		interval: {type: 'number', alias: 't', requiresArg: true, default: 0, describe: 'Time in milliseconds to wait in between calls to OpenAI.'},
		// limit: {type: 'number', alias: 'l', requiresArg: true, describe: 'Maximum number of records to process from the input file.\nIf not specified, no limit will be imposed.'},
		// skip: {type: 'number', alias: 's', requiresArg: true, describe: 'Indicates the number of records at the beginning of the input file that should be skipped.\nIf not specified, no records will be skipped.'},
		model: {type: 'string', alias: 'm', requiresArg: true, default: 'gpt-3.5-turbo-1106', describe: 'The OpenAI chat model to use.'},
	})
	.wrap(null)
	.parse()

const infile = path.resolve(argv.infile)
let outfile = argv.outfile
if (!outfile) {
	const parsedInfile = path.parse(infile)
	outfile = `${parsedInfile.dir}${path.sep}${parsedInfile.name}_out_${dayjs().format('YYYY-MM-DD_HH-mm-ss')}.csv`
}
outfile = path.resolve(outfile)
const parsedOutfile = path.parse(outfile)
if (!fs.existsSync(parsedOutfile.dir)) {
	fs.mkdirSync(parsedOutfile.dir, {recursive: true})
}

console.log(`infile: ${infile}`)
console.log(`outfile: ${outfile}`)
console.log(`concurrency: ${argv.concurrency}`)
console.log(`interval: ${argv.interval}`)
console.log(`model: ${argv.model}`)

const client = openAIClient()

let count = 0

const transforms = [
	fs.createReadStream(infile),
	parse(getParseOptions(argv)),

	// T.count({label: 'in'}),

	T.withMaxConcurrency(argv.concurrency)(async rec => {
		const currentCount = ++count
		console.log(`rec ${currentCount} processing...`)
		let assistant = ''
		try {
			assert(rec.system, '"system" field is missing or empty')
			assert(rec.user, '"user" field is missing or empty')
			const response = await chat(client, {
				model: argv.model,
				messages: [
					{
						"role": "system",
						"content": rec.system
					},
					{
						"role": "user",
						"content": rec.user
					},
				]
			})
			assistant = response.choices[0].message.content
		} catch (err) {
			assistant = err.message
		}
		console.log(`rec ${currentCount} done.`)
		if (argv.interval) {
			console.log(`waiting for ${argv.interval} millis`)
			await setTimeout(argv.interval)
		}
		return R.assoc('assistant', assistant, rec)
	}),

	// T.count({label: 'out'}),

	stringify({header: true}),
	fs.createWriteStream(outfile)
]

await pipeline(transforms)
console.log(outfile)
