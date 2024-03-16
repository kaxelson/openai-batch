Process a batch of OpenAI chat completion requests. The requests must be specified in a csv file <infile> with
two fields named "system" and "user". The contents of these fields will be used as the content of the system
message and the user message sent to OpenAI as part of the chat completion request. Results will be written to
<outfile> which will be a csv containing the fields "system", "user", and "assistant" with the response from
OpenAI contained in the "assistant" field.

Please make sure to specify you OpenAI API key in an environment variable called OPENAI_APIKEY.
This can also be done by adding a file called .env to your working directory and including a line like this:

`OPENAI_APIKEY=<Your OpenAI API key>`

Run like this:
`openai-batch -i <your input file>`
