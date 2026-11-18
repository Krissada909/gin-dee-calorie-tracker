import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'
export type Meal = {
  id: string
  user_id?: string
  eaten_at: string
  meal_type: MealType
  name: string
  calories: number
  image_path?: string | null
  image_url?: string | null
  note?: string | null
}

export type Activity = {
  id: string
  user_id?: string
  performed_at: string
  activity: string
  calories_burned: number
  distance_km: number
}

export const mealLabels: Record<MealType, string> = {
  breakfast: 'มื้อเช้า',
  lunch: 'มื้อกลางวัน',
  dinner: 'มื้อเย็น',
  snack: 'ของว่าง',
}
