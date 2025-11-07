import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'
import dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

async function migrate() {
  console.log('🔄 Running migrations...')

  try {
    // Lê arquivo SQL
    const schemaPath = join(__dirname, '../database/schema.sql')
    const schema = readFileSync(schemaPath, 'utf-8')

    // Executa no Supabase
    const { error } = await supabase.rpc('exec_sql', { sql: schema })

    if (error) throw error

    console.log('✅ Schema migration completed')

    // Executa RLS
    const rlsPath = join(__dirname, '../database/rls.sql')
    const rls = readFileSync(rlsPath, 'utf-8')

    const { error: rlsError } = await supabase.rpc('exec_sql', { sql: rls })

    if (rlsError) throw rlsError

    console.log('✅ RLS policies applied')
    console.log('🎉 Migrations completed successfully!')
  } catch (error) {
    console.error('❌ Error running migrations:', error)
    console.log(
      '\n💡 Tip: Execute SQL files manually in Supabase Dashboard > SQL Editor'
    )
    process.exit(1)
  }

  process.exit(0)
}

migrate()
