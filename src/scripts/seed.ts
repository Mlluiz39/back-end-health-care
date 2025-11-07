import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

async function seed() {
  console.log('🌱 Starting database seed...')

  try {
    // 1. Criar usuário de teste
    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email: 'admin@test.com',
        password: 'test123456',
        email_confirm: true,
      })

    if (authError) throw authError
    console.log('✅ Test user created')

    const userId = authData.user.id

    // 2. Criar perfil
    await supabase.from('profiles').insert({
      id: userId,
      email: 'admin@test.com',
      full_name: 'Admin Teste',
      phone: '+55 11 99999-9999',
    })
    console.log('✅ Profile created')

    // 3. Criar idoso
    const { data: parent } = await supabase
      .from('parents')
      .insert({
        name: 'Maria Silva',
        birth_date: '1950-05-15',
        gender: 'female',
        blood_type: 'A+',
        allergies: ['penicilina'],
        chronic_conditions: ['diabetes tipo 2', 'hipertensão'],
        created_by: userId,
      })
      .select()
      .single()

    console.log('✅ Parent created')

    // 4. Adicionar à família como admin
    await supabase.from('family_members').insert({
      parent_id: parent.id,
      user_id: userId,
      role: 'admin',
      permissions: { can_view: true, can_edit: true, can_delete: true },
      status: 'active',
      invited_by: userId,
      accepted_at: new Date().toISOString(),
    })
    console.log('✅ Family member added')

    // 5. Criar medicamentos
    const medications = [
      {
        parent_id: parent.id,
        name: 'Losartana',
        dosage: '50mg',
        frequency: 'twice_daily',
        times: ['08:00', '20:00'],
        start_date: '2024-01-01',
        is_active: true,
        created_by: userId,
      },
      {
        parent_id: parent.id,
        name: 'Metformina',
        dosage: '850mg',
        frequency: 'twice_daily',
        times: ['08:00', '20:00'],
        start_date: '2024-01-01',
        is_active: true,
        created_by: userId,
      },
    ]

    await supabase.from('medications').insert(medications)
    console.log('✅ Medications created')

    // 6. Criar consulta
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(10, 0, 0, 0)

    await supabase.from('appointments').insert({
      parent_id: parent.id,
      doctor_name: 'Dr. João Cardiologista',
      specialty: 'Cardiologia',
      clinic_name: 'Clínica Coração',
      location: 'Rua das Flores, 123',
      scheduled_at: tomorrow.toISOString(),
      duration_minutes: 60,
      status: 'scheduled',
      created_by: userId,
    })
    console.log('✅ Appointment created')

    console.log('\n🎉 Seed completed successfully!')
    console.log('\n📝 Test credentials:')
    console.log('   Email: admin@test.com')
    console.log('   Password: test123456')
    console.log(`   Parent ID: ${parent.id}`)
  } catch (error) {
    console.error('❌ Error seeding database:', error)
    process.exit(1)
  }

  process.exit(0)
}

seed()
