import * as v from 'valibot'

export async function readBackend(id: string): Promise<{ message: string }> {
  'use server'
  const response = await fetch(
    `http://127.0.0.1:4318/data?id=${encodeURIComponent(id)}`
  )
  const data = v.parse(v.object({ message: v.string() }), await response.json())
  if (!response.ok) throw new Error(data.message)
  return data
}
