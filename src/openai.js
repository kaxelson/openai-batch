import * as dotenv from 'dotenv'

dotenv.config()

import OpenAI from 'openai'
import pRetry from 'p-retry'

import {setTimeout} from 'node:timers/promises'

const {
	OPENAI_APIKEY,
} = process.env

export const openAIClient = () => new OpenAI({
	apiKey: OPENAI_APIKEY,
})

export const chat = async (client, request) => {
	request = Object.assign({
		temperature: 0.2,
		max_tokens: 500,
		top_p: 1,
		frequency_penalty: 0,
		presence_penalty: 0
	}, request)

	const response = await pRetry(async () => {
		return client.chat.completions.create(request, {timeout: 90000})
	}, {
		retries: 5,
		minTimeout: 500,
		randomize: true,
		onFailedAttempt: async err => {
			const waitTime = 500 * Math.pow(2, err.attemptNumber - 1)
			await setTimeout(waitTime)
		},
		shouldRetry: err => {
			return err.response?.status === 429
		}
	})

	return response
}
