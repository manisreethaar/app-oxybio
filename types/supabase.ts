export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      employees: {
        Row: {
          id: string
          full_name: string
          email: string
          role: string
          department: string
          employee_code: string | null
          designation: string | null
          joined_date: string | null
          is_active: boolean
          photo_url: string | null
          created_at: string
        }
        Insert: { /* ... */ }
        Update: { /* ... */ }
      }
      inventory_stock: {
        Row: {
          id: string
          item_name: string
          category: string
          current_quantity: number
          unit: string
          min_threshold: number
          storage_location: string
          last_updated: string
        }
        Insert: { /* ... */ }
        Update: { /* ... */ }
      }
      activity_log: {
        Row: {
          id: string
          title: string
          module: string
          description: string
          actor_id: string
          created_at: string
          status: string
          employees?: { full_name: string }
        }
        Insert: { /* ... */ }
        Update: { /* ... */ }
      }
      sops: {
        Row: {
          id: string
          title: string
          document_id: string
          version: string
          department: string
          status: string
          file_url: string
          created_at: string
        }
        Insert: { /* ... */ }
        Update: { /* ... */ }
      }
      sop_acknowledgements: {
        Row: {
          id: string
          sop_id: string
          employee_id: string
          acknowledged_at: string
        }
        Insert: { /* ... */ }
        Update: { /* ... */ }
      }
      [key: string]: any // Fallback
    }
  }
}
