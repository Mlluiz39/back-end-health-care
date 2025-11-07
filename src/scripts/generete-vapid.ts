import webpush from 'web-push'

function generateVapidKeys() {
  console.log('🔐 Generating VAPID keys for Web Push...\n')

  const vapidKeys = webpush.generateVAPIDKeys()

  console.log('✅ Keys generated! Add to your .env file:\n')
  console.log(`VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`)
  console.log(`VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`)
  console.log(`VAPID_SUBJECT=mailto:seu-email@exemplo.com\n`)

  console.log("💡 Don't forget to update VAPID_SUBJECT with your actual email!")
}

generateVapidKeys()
