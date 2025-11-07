async function checkHealth() {
  const url = process.env.API_URL || 'http://localhost:3000'

  console.log(`🏥 Checking API health at ${url}...\n`)

  try {
    const response = await fetch(`${url}/health`)
    const data = await response.json()

    if (response.ok) {
      console.log('✅ API is healthy!')
      console.log('Response:', JSON.stringify(data, null, 2))
    } else {
      console.log('❌ API returned error')
      console.log('Status:', response.status)
      console.log('Response:', data)
      process.exit(1)
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('❌ Failed to connect to API:', errorMessage)
    process.exit(1)
  }
}

checkHealth()
