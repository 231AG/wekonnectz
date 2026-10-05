
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
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "audit":
{ Args: { "p_action": Database["public"]['Enums']["audit_action"],"p_entity_id": string,"p_entity_type": string,"p_metadata"?: Json }; Returns: string
                           },
"get_setting":
{ Args: { "p_key": string }; Returns: Json
                           }
          }
          Enums: {
            "audit_action": "USER_SUSPENDED"|"USER_BANNED"|"USER_RESTORED"|"VERIFICATION_APPROVED"|"VERIFICATION_REJECTED"|"SELFIE_VIEWED"|"PHOTO_APPROVED"|"PHOTO_REJECTED"|"DOB_CORRECTED"|"SUBSCRIPTION_MODIFIED"|"PAYMENT_REFUNDED"|"PAYMENT_CLAIM_APPROVED"|"PAYMENT_CLAIM_REJECTED"|"PAYMENT_CLAIM_NEEDS_INFO"|"EVIDENCE_VIEWED"|"REPORT_RESOLVED"|"SETTING_CHANGED"|"ROLE_CHANGED"|"ADMIN_CREATED"
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
            "audit_action": ["USER_SUSPENDED", "USER_BANNED", "USER_RESTORED", "VERIFICATION_APPROVED", "VERIFICATION_REJECTED", "SELFIE_VIEWED", "PHOTO_APPROVED", "PHOTO_REJECTED", "DOB_CORRECTED", "SUBSCRIPTION_MODIFIED", "PAYMENT_REFUNDED", "PAYMENT_CLAIM_APPROVED", "PAYMENT_CLAIM_REJECTED", "PAYMENT_CLAIM_NEEDS_INFO", "EVIDENCE_VIEWED", "REPORT_RESOLVED", "SETTING_CHANGED", "ROLE_CHANGED", "ADMIN_CREATED"]
          }
        }
} as const
