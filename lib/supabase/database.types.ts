
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "app_settings": {
                  Row: {
                    "created_at": string,"description": string,"key": string,"updated_at": string,"updated_by": string | null,"value": Json | null
                  }
                  Insert: {
                    "created_at"?: string,"description": string,"key": string,"updated_at"?: string,"updated_by"?: string | null,"value"?: Json | null
                  }
                  Update: {
                    "created_at"?: string,"description"?: string,"key"?: string,"updated_at"?: string,"updated_by"?: string | null,"value"?: Json | null
                  }
                  Relationships: [
                    
                  ]
                },"audit_logs": {
                  Row: {
                    "action": Database["public"]['Enums']["audit_action"],"actor_id": string,"created_at": string,"entity_id": string | null,"entity_type": string,"id": string,"metadata": NonNullable<Json>
                  }
                  Insert: {
                    "action": Database["public"]['Enums']["audit_action"],"actor_id": string,"created_at"?: string,"entity_id"?: string | null,"entity_type": string,"id"?: string,"metadata"?: NonNullable<Json>
                  }
                  Update: {
                    "action"?: Database["public"]['Enums']["audit_action"],"actor_id"?: string,"created_at"?: string,"entity_id"?: string | null,"entity_type"?: string,"id"?: string,"metadata"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"auth_hook_receipts": {
                  Row: {
                    "message_id": string,"received_at": string
                  }
                  Insert: {
                    "message_id": string,"received_at"?: string
                  }
                  Update: {
                    "message_id"?: string,"received_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"consents": {
                  Row: {
                    "accepted_at": string,"created_at": string,"document": Database["public"]['Enums']["consent_document"],"id": string,"user_id": string,"version": string
                  }
                  Insert: {
                    "accepted_at"?: string,"created_at"?: string,"document": Database["public"]['Enums']["consent_document"],"id"?: string,"user_id": string,"version": string
                  }
                  Update: {
                    "accepted_at"?: string,"created_at"?: string,"document"?: Database["public"]['Enums']["consent_document"],"id"?: string,"user_id"?: string,"version"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "consents_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"geo_checks": {
                  Row: {
                    "created_at": string,"id": string,"ip_country": string | null,"phone_country": string | null,"phone_hash": string | null,"result": Database["public"]['Enums']["geo_result"]
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"ip_country"?: string | null,"phone_country"?: string | null,"phone_hash"?: string | null,"result": Database["public"]['Enums']["geo_result"]
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"ip_country"?: string | null,"phone_country"?: string | null,"phone_hash"?: string | null,"result"?: Database["public"]['Enums']["geo_result"]
                  }
                  Relationships: [
                    
                  ]
                },"geo_passes": {
                  Row: {
                    "created_at": string,"expires_at": string,"phone_hash": string,"used_at": string | null
                  }
                  Insert: {
                    "created_at"?: string,"expires_at": string,"phone_hash": string,"used_at"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"expires_at"?: string,"phone_hash"?: string,"used_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"phone_blocklist": {
                  Row: {
                    "created_at": string,"created_by": string | null,"phone_hash": string,"reason": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"phone_hash": string,"reason": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"phone_hash"?: string,"reason"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "phone_blocklist_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"date_of_birth": string,"dob_locked": boolean,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"date_of_birth": string,"dob_locked"?: boolean,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"date_of_birth"?: string,"dob_locked"?: boolean,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"rate_limit_counters": {
                  Row: {
                    "bucket": string,"count": number,"subject_hash": string,"window_start": string
                  }
                  Insert: {
                    "bucket": string,"count"?: number,"subject_hash": string,"window_start": string
                  }
                  Update: {
                    "bucket"?: string,"count"?: number,"subject_hash"?: string,"window_start"?: string
                  }
                  Relationships: [
                    
                  ]
                },"users": {
                  Row: {
                    "created_at": string,"deleted_at": string | null,"id": string,"last_seen_at": string | null,"role": Database["public"]['Enums']["user_role"],"status": Database["public"]['Enums']["account_status"],"suspended_until": string | null,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"deleted_at"?: string | null,"id": string,"last_seen_at"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"status"?: Database["public"]['Enums']["account_status"],"suspended_until"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"deleted_at"?: string | null,"id"?: string,"last_seen_at"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"status"?: Database["public"]['Enums']["account_status"],"suspended_until"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "age_in_years":
{ Args: { "p_dob": string,"p_on"?: string }; Returns: number
                           },
"audit":
{ Args: { "p_action": Database["public"]['Enums']["audit_action"],"p_entity_id": string,"p_entity_type": string,"p_metadata"?: Json }; Returns: string
                           },
"begin_signup":
{ Args: { "p_ip": string,"p_ip_country": string,"p_phone": string }; Returns: Database["public"]['Enums']["geo_result"]
                           },
"claim_hook_receipt":
{ Args: { "p_message_id": string }; Returns: boolean
                           },
"current_user_can_act":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"current_user_status":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["account_status"]
                           },
"effective_account_status":
{ Args: { "p_status": Database["public"]['Enums']["account_status"],"p_suspended_until": string }; Returns: Database["public"]['Enums']["account_status"]
                           },
"get_setting":
{ Args: { "p_key": string }; Returns: Json
                           },
"hmac_with_pepper":
{ Args: { "p_value": string }; Returns: string
                           },
"hook_before_user_created":
{ Args: { "event": Json }; Returns: Json
                           },
"hook_password_verification_attempt":
{ Args: { "event": Json }; Returns: Json
                           },
"is_liberian_phone":
{ Args: { "p_phone": string }; Returns: boolean
                           },
"is_staff":
{ Args: { "p_min_role"?: Database["public"]['Enums']["user_role"] }; Returns: boolean
                           },
"normalize_phone":
{ Args: { "p_phone": string }; Returns: string
                           },
"otp_ip_allowed":
{ Args: { "p_ip": string }; Returns: boolean
                           },
"otp_send_allowed":
{ Args: { "p_phone": string }; Returns: boolean
                           },
"phone_hash":
{ Args: { "p_phone": string }; Returns: string
                           },
"rate_limit_hit":
{ Args: { "p_bucket": string,"p_max": number,"p_subject": string,"p_window_seconds": number }; Returns: boolean
                           },
"release_hook_receipt":
{ Args: { "p_message_id": string }; Returns: undefined
                           },
"set_date_of_birth":
{ Args: { "p_dob": string }; Returns: undefined
                           }
          }
          Enums: {
            "account_status": "PENDING"|"ACTIVE"|"SUSPENDED"|"BANNED"|"DELETED","audit_action": "USER_SUSPENDED"|"USER_BANNED"|"USER_RESTORED"|"VERIFICATION_APPROVED"|"VERIFICATION_REJECTED"|"SELFIE_VIEWED"|"PHOTO_APPROVED"|"PHOTO_REJECTED"|"DOB_CORRECTED"|"SUBSCRIPTION_MODIFIED"|"PAYMENT_REFUNDED"|"PAYMENT_CLAIM_APPROVED"|"PAYMENT_CLAIM_REJECTED"|"PAYMENT_CLAIM_NEEDS_INFO"|"EVIDENCE_VIEWED"|"REPORT_RESOLVED"|"SETTING_CHANGED"|"ROLE_CHANGED"|"ADMIN_CREATED","consent_document": "TERMS"|"PRIVACY"|"RULES","geo_result": "PASS"|"BLOCKED_COUNTRY"|"BLOCKED_PHONE"|"BLOCKED_LIST"|"RATE_LIMITED","user_role": "USER"|"MODERATOR"|"ADMIN"|"SUPER_ADMIN"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "account_status": ["PENDING", "ACTIVE", "SUSPENDED", "BANNED", "DELETED"],"audit_action": ["USER_SUSPENDED", "USER_BANNED", "USER_RESTORED", "VERIFICATION_APPROVED", "VERIFICATION_REJECTED", "SELFIE_VIEWED", "PHOTO_APPROVED", "PHOTO_REJECTED", "DOB_CORRECTED", "SUBSCRIPTION_MODIFIED", "PAYMENT_REFUNDED", "PAYMENT_CLAIM_APPROVED", "PAYMENT_CLAIM_REJECTED", "PAYMENT_CLAIM_NEEDS_INFO", "EVIDENCE_VIEWED", "REPORT_RESOLVED", "SETTING_CHANGED", "ROLE_CHANGED", "ADMIN_CREATED"],"consent_document": ["TERMS", "PRIVACY", "RULES"],"geo_result": ["PASS", "BLOCKED_COUNTRY", "BLOCKED_PHONE", "BLOCKED_LIST", "RATE_LIMITED"],"user_role": ["USER", "MODERATOR", "ADMIN", "SUPER_ADMIN"]
          }
        }
} as const
