import { supabase } from './supabase'

const BUCKET = 'food-photos'

export async function uploadFoodPhoto(userId: string, file: File): Promise<string> {
  if (!supabase) throw new Error('ยังไม่ได้เชื่อมต่อ Supabase')
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-80) || 'meal.jpg'
  const path = `${userId}/${Date.now()}-${safeName}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || 'image/jpeg',
  })
  if (error) throw error
  return path
}

export async function signedFoodPhotoUrl(path: string | null | undefined): Promise<string | null> {
  if (!supabase || !path) return null
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60)
  if (error) return null
  return data.signedUrl
}
