
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
                },"areas": {
                  Row: {
                    "active": boolean,"county": string,"created_at": string,"id": string,"name": string,"updated_at": string
                  }
                  Insert: {
                    "active"?: boolean,"county": string,"created_at"?: string,"id"?: string,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"county"?: string,"created_at"?: string,"id"?: string,"name"?: string,"updated_at"?: string
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
                },"availability": {
                  Row: {
                    "created_at": string,"end_at": string | null,"start_at": string | null,"status": Database["public"]['Enums']["availability_status"],"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"end_at"?: string | null,"start_at"?: string | null,"status"?: Database["public"]['Enums']["availability_status"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"end_at"?: string | null,"start_at"?: string | null,"status"?: Database["public"]['Enums']["availability_status"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "availability_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"availability_windows": {
                  Row: {
                    "created_at": string,"end_at": string,"ended_at": string | null,"id": string,"start_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"end_at": string,"ended_at"?: string | null,"id"?: string,"start_at": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"end_at"?: string,"ended_at"?: string | null,"id"?: string,"start_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "availability_windows_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"blocks": {
                  Row: {
                    "blocked_id": string,"blocker_id": string,"created_at": string,"id": string,"target_visible": boolean
                  }
                  Insert: {
                    "blocked_id": string,"blocker_id": string,"created_at"?: string,"id"?: string,"target_visible"?: boolean
                  }
                  Update: {
                    "blocked_id"?: string,"blocker_id"?: string,"created_at"?: string,"id"?: string,"target_visible"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "blocks_blocked_id_fkey"
      columns: ["blocked_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "blocks_blocker_id_fkey"
      columns: ["blocker_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"card_customers": {
                  Row: {
                    "created_at": string,"customer_ref": string,"processor": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"customer_ref": string,"processor": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"customer_ref"?: string,"processor"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "card_customers_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"claim_evidence": {
                  Row: {
                    "claim_id": string,"created_at": string,"deleted_at": string | null,"id": string,"path": string,"sha256": string
                  }
                  Insert: {
                    "claim_id": string,"created_at"?: string,"deleted_at"?: string | null,"id"?: string,"path": string,"sha256": string
                  }
                  Update: {
                    "claim_id"?: string,"created_at"?: string,"deleted_at"?: string | null,"id"?: string,"path"?: string,"sha256"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "claim_evidence_claim_id_fkey"
      columns: ["claim_id"]
isOneToOne: false
      referencedRelation: "payment_claims"
      referencedColumns: ["id"]
    }
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
      foreignKeyName: "consents_document_version_fk"
      columns: ["document","version"]
isOneToOne: false
      referencedRelation: "legal_documents"
      referencedColumns: ["document","version"]
    },{
      foreignKeyName: "consents_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"conversation_members": {
                  Row: {
                    "conversation_id": string,"joined_at": string,"last_read_at": string | null,"user_id": string
                  }
                  Insert: {
                    "conversation_id": string,"joined_at"?: string,"last_read_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "conversation_id"?: string,"joined_at"?: string,"last_read_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "conversation_members_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversation_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"conversations": {
                  Row: {
                    "closed_at": string | null,"closed_by": string | null,"closed_reason": string | null,"created_at": string,"id": string,"last_message_at": string | null,"match_id": string | null,"status": Database["public"]['Enums']["conversation_status"],"type": Database["public"]['Enums']["conversation_type"]
                  }
                  Insert: {
                    "closed_at"?: string | null,"closed_by"?: string | null,"closed_reason"?: string | null,"created_at"?: string,"id"?: string,"last_message_at"?: string | null,"match_id"?: string | null,"status"?: Database["public"]['Enums']["conversation_status"],"type": Database["public"]['Enums']["conversation_type"]
                  }
                  Update: {
                    "closed_at"?: string | null,"closed_by"?: string | null,"closed_reason"?: string | null,"created_at"?: string,"id"?: string,"last_message_at"?: string | null,"match_id"?: string | null,"status"?: Database["public"]['Enums']["conversation_status"],"type"?: Database["public"]['Enums']["conversation_type"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "conversations_closed_by_fkey"
      columns: ["closed_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversations_match_id_fkey"
      columns: ["match_id"]
isOneToOne: true
      referencedRelation: "matches"
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
                },"interests": {
                  Row: {
                    "active": boolean,"created_at": string,"id": string,"name": string,"slug": string,"updated_at": string
                  }
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"name": string,"slug": string,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"name"?: string,"slug"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"legal_documents": {
                  Row: {
                    "body": string,"content_sha256": string | null,"created_at": string,"document": Database["public"]['Enums']["consent_document"],"is_current": boolean,"published_at": string,"title": string,"version": string
                  }
                  Insert: {
                    "body": string,"content_sha256"?: never,"created_at"?: string,"document": Database["public"]['Enums']["consent_document"],"is_current"?: boolean,"published_at"?: string,"title": string,"version": string
                  }
                  Update: {
                    "body"?: string,"content_sha256"?: never,"created_at"?: string,"document"?: Database["public"]['Enums']["consent_document"],"is_current"?: boolean,"published_at"?: string,"title"?: string,"version"?: string
                  }
                  Relationships: [
                    
                  ]
                },"likes": {
                  Row: {
                    "created_at": string,"id": string,"receiver_id": string,"sender_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"receiver_id": string,"sender_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"receiver_id"?: string,"sender_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "likes_receiver_id_fkey"
      columns: ["receiver_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "likes_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"matches": {
                  Row: {
                    "created_at": string,"id": string,"status": Database["public"]['Enums']["match_status"],"unmatched_at": string | null,"unmatched_by": string | null,"user_a_id": string,"user_b_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"status"?: Database["public"]['Enums']["match_status"],"unmatched_at"?: string | null,"unmatched_by"?: string | null,"user_a_id": string,"user_b_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"status"?: Database["public"]['Enums']["match_status"],"unmatched_at"?: string | null,"unmatched_by"?: string | null,"user_a_id"?: string,"user_b_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "matches_unmatched_by_fkey"
      columns: ["unmatched_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "matches_user_a_id_fkey"
      columns: ["user_a_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "matches_user_b_id_fkey"
      columns: ["user_b_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"merchant_accounts": {
                  Row: {
                    "active": boolean,"created_at": string,"display_name": string,"id": string,"number_or_code": string,"provider": Database["public"]['Enums']["payment_provider"],"updated_at": string
                  }
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"display_name": string,"id"?: string,"number_or_code": string,"provider": Database["public"]['Enums']["payment_provider"],"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"display_name"?: string,"id"?: string,"number_or_code"?: string,"provider"?: Database["public"]['Enums']["payment_provider"],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"messages": {
                  Row: {
                    "body": string,"conversation_id": string,"created_at": string,"flagged": boolean,"id": string,"read_at": string | null,"sender_id": string | null
                  }
                  Insert: {
                    "body": string,"conversation_id": string,"created_at"?: string,"flagged"?: boolean,"id"?: string,"read_at"?: string | null,"sender_id"?: string | null
                  }
                  Update: {
                    "body"?: string,"conversation_id"?: string,"created_at"?: string,"flagged"?: boolean,"id"?: string,"read_at"?: string | null,"sender_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "messages_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"moderation_flags": {
                  Row: {
                    "created_at": string,"details": NonNullable<Json>,"entity_id": string,"entity_type": string,"id": string,"reason": string,"reviewed_at": string | null,"reviewed_by": string | null,"status": Database["public"]['Enums']["flag_status"]
                  }
                  Insert: {
                    "created_at"?: string,"details"?: NonNullable<Json>,"entity_id": string,"entity_type": string,"id"?: string,"reason": string,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: Database["public"]['Enums']["flag_status"]
                  }
                  Update: {
                    "created_at"?: string,"details"?: NonNullable<Json>,"entity_id"?: string,"entity_type"?: string,"id"?: string,"reason"?: string,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: Database["public"]['Enums']["flag_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "moderation_flags_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "created_at": string,"id": string,"payload": NonNullable<Json>,"read_at": string | null,"type": Database["public"]['Enums']["notification_type"],"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"payload"?: NonNullable<Json>,"read_at"?: string | null,"type": Database["public"]['Enums']["notification_type"],"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"payload"?: NonNullable<Json>,"read_at"?: string | null,"type"?: Database["public"]['Enums']["notification_type"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"passes": {
                  Row: {
                    "created_at": string,"id": string,"receiver_id": string,"sender_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"receiver_id": string,"sender_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"receiver_id"?: string,"sender_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "passes_receiver_id_fkey"
      columns: ["receiver_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "passes_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"payment_claims": {
                  Row: {
                    "amount": number,"created_at": string,"currency": string,"evidence_deleted_at": string | null,"evidence_path": string | null,"evidence_sha256": string,"id": string,"member_note": string | null,"merchant_account_id": string,"paid_at": string,"plan_id": string,"provider": Database["public"]['Enums']["payment_provider"],"reference_code": string,"rejection_reason": Database["public"]['Enums']["claim_rejection_reason"] | null,"reviewed_at": string | null,"reviewed_by": string | null,"sender_phone": string,"staff_question": string | null,"status": Database["public"]['Enums']["claim_status"],"transaction_id": string,"transaction_key": string,"updated_at": string,"user_id": string | null
                  }
                  Insert: {
                    "amount": number,"created_at"?: string,"currency": string,"evidence_deleted_at"?: string | null,"evidence_path"?: string | null,"evidence_sha256": string,"id"?: string,"member_note"?: string | null,"merchant_account_id": string,"paid_at": string,"plan_id": string,"provider": Database["public"]['Enums']["payment_provider"],"reference_code": string,"rejection_reason"?: Database["public"]['Enums']["claim_rejection_reason"] | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"sender_phone": string,"staff_question"?: string | null,"status"?: Database["public"]['Enums']["claim_status"],"transaction_id": string,"transaction_key": string,"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"currency"?: string,"evidence_deleted_at"?: string | null,"evidence_path"?: string | null,"evidence_sha256"?: string,"id"?: string,"member_note"?: string | null,"merchant_account_id"?: string,"paid_at"?: string,"plan_id"?: string,"provider"?: Database["public"]['Enums']["payment_provider"],"reference_code"?: string,"rejection_reason"?: Database["public"]['Enums']["claim_rejection_reason"] | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"sender_phone"?: string,"staff_question"?: string | null,"status"?: Database["public"]['Enums']["claim_status"],"transaction_id"?: string,"transaction_key"?: string,"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "payment_claims_merchant_account_id_fkey"
      columns: ["merchant_account_id"]
isOneToOne: false
      referencedRelation: "merchant_accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_claims_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "subscription_plans"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_claims_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_claims_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"payment_events": {
                  Row: {
                    "actor_id": string | null,"claim_id": string | null,"id": string,"payment_id": string | null,"processor": string | null,"processor_event_id": string | null,"raw_payload": NonNullable<Json>,"received_at": string,"signature_valid": boolean | null,"type": string
                  }
                  Insert: {
                    "actor_id"?: string | null,"claim_id"?: string | null,"id"?: string,"payment_id"?: string | null,"processor"?: string | null,"processor_event_id"?: string | null,"raw_payload"?: NonNullable<Json>,"received_at"?: string,"signature_valid"?: boolean | null,"type": string
                  }
                  Update: {
                    "actor_id"?: string | null,"claim_id"?: string | null,"id"?: string,"payment_id"?: string | null,"processor"?: string | null,"processor_event_id"?: string | null,"raw_payload"?: NonNullable<Json>,"received_at"?: string,"signature_valid"?: boolean | null,"type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payment_events_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_events_claim_id_fkey"
      columns: ["claim_id"]
isOneToOne: false
      referencedRelation: "payment_claims"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_events_payment_id_fkey"
      columns: ["payment_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount": number,"claim_id": string | null,"created_at": string,"currency": string,"id": string,"paid_at": string | null,"plan_id": string,"processor_subscription_ref": string | null,"provider": Database["public"]['Enums']["payment_provider"],"provider_transaction_id": string,"source": Database["public"]['Enums']["payment_source"],"status": Database["public"]['Enums']["payment_status"],"transaction_key": string,"user_id": string | null
                  }
                  Insert: {
                    "amount": number,"claim_id"?: string | null,"created_at"?: string,"currency": string,"id"?: string,"paid_at"?: string | null,"plan_id": string,"processor_subscription_ref"?: string | null,"provider": Database["public"]['Enums']["payment_provider"],"provider_transaction_id": string,"source": Database["public"]['Enums']["payment_source"],"status": Database["public"]['Enums']["payment_status"],"transaction_key": string,"user_id"?: string | null
                  }
                  Update: {
                    "amount"?: number,"claim_id"?: string | null,"created_at"?: string,"currency"?: string,"id"?: string,"paid_at"?: string | null,"plan_id"?: string,"processor_subscription_ref"?: string | null,"provider"?: Database["public"]['Enums']["payment_provider"],"provider_transaction_id"?: string,"source"?: Database["public"]['Enums']["payment_source"],"status"?: Database["public"]['Enums']["payment_status"],"transaction_key"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_claim_id_fkey"
      columns: ["claim_id"]
isOneToOne: true
      referencedRelation: "payment_claims"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "subscription_plans"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
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
                },"profile_photos": {
                  Row: {
                    "created_at": string,"id": string,"is_primary": boolean,"processing_started_at": string | null,"rejection_reason": Database["public"]['Enums']["photo_rejection_reason"] | null,"reviewed_as_primary": boolean,"reviewed_at": string | null,"reviewed_by": string | null,"sort_order": number,"status": Database["public"]['Enums']["photo_status"],"storage_path": string | null,"submitted_at": string | null,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_primary"?: boolean,"processing_started_at"?: string | null,"rejection_reason"?: Database["public"]['Enums']["photo_rejection_reason"] | null,"reviewed_as_primary"?: boolean,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"sort_order"?: number,"status"?: Database["public"]['Enums']["photo_status"],"storage_path"?: string | null,"submitted_at"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_primary"?: boolean,"processing_started_at"?: string | null,"rejection_reason"?: Database["public"]['Enums']["photo_rejection_reason"] | null,"reviewed_as_primary"?: boolean,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"sort_order"?: number,"status"?: Database["public"]['Enums']["photo_status"],"storage_path"?: string | null,"submitted_at"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profile_photos_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profile_photos_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "area_id": string | null,"bio": string | null,"created_at": string,"date_of_birth": string,"display_name": string | null,"dob_locked": boolean,"gender": Database["public"]['Enums']["gender"] | null,"intent_casual": boolean,"intent_relationship": boolean,"is_profile_complete": boolean,"seeking_genders": (Database["public"]['Enums']["gender"])[] | null,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "area_id"?: string | null,"bio"?: string | null,"created_at"?: string,"date_of_birth": string,"display_name"?: string | null,"dob_locked"?: boolean,"gender"?: Database["public"]['Enums']["gender"] | null,"intent_casual"?: boolean,"intent_relationship"?: boolean,"is_profile_complete"?: boolean,"seeking_genders"?: (Database["public"]['Enums']["gender"])[] | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "area_id"?: string | null,"bio"?: string | null,"created_at"?: string,"date_of_birth"?: string,"display_name"?: string | null,"dob_locked"?: boolean,"gender"?: Database["public"]['Enums']["gender"] | null,"intent_casual"?: boolean,"intent_relationship"?: boolean,"is_profile_complete"?: boolean,"seeking_genders"?: (Database["public"]['Enums']["gender"])[] | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_area_id_fkey"
      columns: ["area_id"]
isOneToOne: false
      referencedRelation: "areas"
      referencedColumns: ["id"]
    },{
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
                },"report_messages": {
                  Row: {
                    "body": string,"id": string,"message_id": string | null,"report_id": string,"sender_id": string | null,"sent_at": string
                  }
                  Insert: {
                    "body": string,"id"?: string,"message_id"?: string | null,"report_id": string,"sender_id"?: string | null,"sent_at": string
                  }
                  Update: {
                    "body"?: string,"id"?: string,"message_id"?: string | null,"report_id"?: string,"sender_id"?: string | null,"sent_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "report_messages_message_id_fkey"
      columns: ["message_id"]
isOneToOne: false
      referencedRelation: "messages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "report_messages_report_id_fkey"
      columns: ["report_id"]
isOneToOne: false
      referencedRelation: "reports"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "report_messages_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"report_notes": {
                  Row: {
                    "author_id": string | null,"created_at": string,"id": string,"note": string,"report_id": string
                  }
                  Insert: {
                    "author_id"?: string | null,"created_at"?: string,"id"?: string,"note": string,"report_id": string
                  }
                  Update: {
                    "author_id"?: string | null,"created_at"?: string,"id"?: string,"note"?: string,"report_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "report_notes_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "report_notes_report_id_fkey"
      columns: ["report_id"]
isOneToOne: false
      referencedRelation: "reports"
      referencedColumns: ["id"]
    }
                  ]
                },"reports": {
                  Row: {
                    "auto_actions": boolean,"category": Database["public"]['Enums']["report_category"],"conversation_id": string | null,"created_at": string,"description": string | null,"id": string,"photo_id": string | null,"priority": Database["public"]['Enums']["report_priority"],"reported_user_id": string,"reporter_id": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"status": Database["public"]['Enums']["report_status"]
                  }
                  Insert: {
                    "auto_actions"?: boolean,"category": Database["public"]['Enums']["report_category"],"conversation_id"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"photo_id"?: string | null,"priority": Database["public"]['Enums']["report_priority"],"reported_user_id": string,"reporter_id"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: Database["public"]['Enums']["report_status"]
                  }
                  Update: {
                    "auto_actions"?: boolean,"category"?: Database["public"]['Enums']["report_category"],"conversation_id"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"photo_id"?: string | null,"priority"?: Database["public"]['Enums']["report_priority"],"reported_user_id"?: string,"reporter_id"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: Database["public"]['Enums']["report_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "reports_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_photo_id_fkey"
      columns: ["photo_id"]
isOneToOne: false
      referencedRelation: "profile_photos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_reported_user_id_fkey"
      columns: ["reported_user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_reporter_id_fkey"
      columns: ["reporter_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"subscription_plans": {
                  Row: {
                    "active": boolean,"code": string,"created_at": string,"currency": string,"duration_hours": number,"id": string,"name": string,"price": number,"processor_price_id": string | null,"renews": boolean,"sort_order": number,"source": Database["public"]['Enums']["payment_source"],"updated_at": string
                  }
                  Insert: {
                    "active"?: boolean,"code": string,"created_at"?: string,"currency"?: string,"duration_hours": number,"id"?: string,"name": string,"price": number,"processor_price_id"?: string | null,"renews"?: boolean,"sort_order"?: number,"source": Database["public"]['Enums']["payment_source"],"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"code"?: string,"created_at"?: string,"currency"?: string,"duration_hours"?: number,"id"?: string,"name"?: string,"price"?: number,"processor_price_id"?: string | null,"renews"?: boolean,"sort_order"?: number,"source"?: Database["public"]['Enums']["payment_source"],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"subscriptions": {
                  Row: {
                    "auto_renew": boolean,"cancel_at_period_end": boolean,"closed_disputes": (string)[],"created_at": string,"expires_at": string,"grace_for_period_end": string | null,"id": string,"last_event_at": string | null,"locked_price": number | null,"open_disputes": (string)[],"period_end": string | null,"plan_id": string,"processor": string | null,"processor_cancelled_at": string | null,"processor_subscription_id": string | null,"source": Database["public"]['Enums']["payment_source"],"source_payment_id": string | null,"starts_at": string,"status": Database["public"]['Enums']["subscription_status"],"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "auto_renew"?: boolean,"cancel_at_period_end"?: boolean,"closed_disputes"?: (string)[],"created_at"?: string,"expires_at": string,"grace_for_period_end"?: string | null,"id"?: string,"last_event_at"?: string | null,"locked_price"?: number | null,"open_disputes"?: (string)[],"period_end"?: string | null,"plan_id": string,"processor"?: string | null,"processor_cancelled_at"?: string | null,"processor_subscription_id"?: string | null,"source": Database["public"]['Enums']["payment_source"],"source_payment_id"?: string | null,"starts_at": string,"status": Database["public"]['Enums']["subscription_status"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "auto_renew"?: boolean,"cancel_at_period_end"?: boolean,"closed_disputes"?: (string)[],"created_at"?: string,"expires_at"?: string,"grace_for_period_end"?: string | null,"id"?: string,"last_event_at"?: string | null,"locked_price"?: number | null,"open_disputes"?: (string)[],"period_end"?: string | null,"plan_id"?: string,"processor"?: string | null,"processor_cancelled_at"?: string | null,"processor_subscription_id"?: string | null,"source"?: Database["public"]['Enums']["payment_source"],"source_payment_id"?: string | null,"starts_at"?: string,"status"?: Database["public"]['Enums']["subscription_status"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "subscriptions_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "subscription_plans"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subscriptions_source_payment_id_fkey"
      columns: ["source_payment_id"]
isOneToOne: true
      referencedRelation: "payments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subscriptions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"user_interests": {
                  Row: {
                    "created_at": string,"interest_id": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"interest_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"interest_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_interests_interest_id_fkey"
      columns: ["interest_id"]
isOneToOne: false
      referencedRelation: "interests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_interests_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"user_settings": {
                  Row: {
                    "casual_message_permission": Database["public"]['Enums']["message_permission"],"created_at": string,"notification_prefs": NonNullable<Json>,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "casual_message_permission"?: Database["public"]['Enums']["message_permission"],"created_at"?: string,"notification_prefs"?: NonNullable<Json>,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "casual_message_permission"?: Database["public"]['Enums']["message_permission"],"created_at"?: string,"notification_prefs"?: NonNullable<Json>,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_settings_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"users": {
                  Row: {
                    "created_at": string,"deleted_at": string | null,"hidden_at": string | null,"hidden_reason": string | null,"id": string,"last_seen_at": string | null,"role": Database["public"]['Enums']["user_role"],"status": Database["public"]['Enums']["account_status"],"suspended_until": string | null,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"deleted_at"?: string | null,"hidden_at"?: string | null,"hidden_reason"?: string | null,"id": string,"last_seen_at"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"status"?: Database["public"]['Enums']["account_status"],"suspended_until"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"deleted_at"?: string | null,"hidden_at"?: string | null,"hidden_reason"?: string | null,"id"?: string,"last_seen_at"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"status"?: Database["public"]['Enums']["account_status"],"suspended_until"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"verifications": {
                  Row: {
                    "created_at": string,"escalated": boolean,"id": string,"pose_prompt": string,"processing_started_at": string | null,"rejection_reason": Database["public"]['Enums']["verification_rejection_reason"] | null,"reviewed_at": string | null,"reviewed_by": string | null,"selfie_deleted_at": string | null,"selfie_storage_path": string | null,"status": Database["public"]['Enums']["verification_status"],"submitted_at": string | null,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"escalated"?: boolean,"id"?: string,"pose_prompt": string,"processing_started_at"?: string | null,"rejection_reason"?: Database["public"]['Enums']["verification_rejection_reason"] | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"selfie_deleted_at"?: string | null,"selfie_storage_path"?: string | null,"status"?: Database["public"]['Enums']["verification_status"],"submitted_at"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"escalated"?: boolean,"id"?: string,"pose_prompt"?: string,"processing_started_at"?: string | null,"rejection_reason"?: Database["public"]['Enums']["verification_rejection_reason"] | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"selfie_deleted_at"?: string | null,"selfie_storage_path"?: string | null,"status"?: Database["public"]['Enums']["verification_status"],"submitted_at"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "verifications_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "verifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "abort_photo_upload":
{ Args: { "p_photo_id": string,"p_user_id": string }; Returns: undefined
                           },
"accept_current_documents":
{ Args: { "p_user_id": string,"p_versions": Json }; Returns: undefined
                           },
"add_report_note":
{ Args: { "p_note": string,"p_report_id": string }; Returns: undefined
                           },
"age_in_years":
{ Args: { "p_dob": string,"p_on"?: string }; Returns: number
                           },
"apply_card_event":
{ Args: { "p_event": Json,"p_processor": string }; Returns: Json
                           },
"approve_payment_claim":
{ Args: { "p_claim": string,"p_wallet_amount": number }; Returns: Json
                           },
"assert_can_edit_profile":
{ Args: { "p_user_id": string }; Returns: undefined
                           },
"assert_can_pay":
{ Args: { "p_user": string }; Returns: undefined
                           },
"assert_can_report":
{ Args: { "p_reporter": string }; Returns: undefined
                           },
"assert_can_verify":
{ Args: { "p_user_id": string }; Returns: undefined
                           },
"assert_claim_reviewer":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"assert_member_can_act":
{ Args: { "p_user_id": string }; Returns: undefined
                           },
"assert_member_can_manage_photos":
{ Args: { "p_user_id": string }; Returns: undefined
                           },
"assert_staff_target":
{ Args: { "p_target": string }; Returns: undefined
                           },
"audit":
{ Args: { "p_action": Database["public"]['Enums']["audit_action"],"p_entity_id": string,"p_entity_type": string,"p_metadata"?: Json }; Returns: string
                           },
"ban_user":
{ Args: { "p_reason": string,"p_report_id"?: string,"p_target": string }; Returns: undefined
                           },
"begin_photo_upload":
{ Args: { "p_user_id": string }; Returns: string
                           },
"begin_signup":
{ Args: { "p_ip": string,"p_ip_country": string,"p_phone": string }; Returns: Database["public"]['Enums']["geo_result"]
                           },
"block_user":
{ Args: { "p_target": string,"p_user_id": string }; Returns: undefined
                           },
"bootstrap_super_admin":
{ Args: { "p_user_id": string }; Returns: undefined
                           },
"can_join_conversation_topic":
{ Args: { "p_topic": string }; Returns: boolean
                           },
"can_send_in":
{ Args: { "p_conversation": string,"p_viewer": string }; Returns: boolean
                           },
"can_view_profile":
{ Args: { "p_owner": string,"p_viewer": string }; Returns: boolean
                           },
"cancel_payment_claim":
{ Args: { "p_claim": string,"p_user": string }; Returns: undefined
                           },
"card_cancel_needed":
{ Args: { "p_processor": string,"p_ref": string }; Returns: boolean
                           },
"card_event_transition":
{ Args: { "p_at": string,"p_event": Json,"p_processor": string }; Returns: string
                           },
"card_needs_refund":
{ Args: { "p_payment": string,"p_reason": string,"p_sub": Database["public"]['Tables']["subscriptions"]['Row'] }; Returns: undefined
                           },
"card_not_yet_known":
{ Args: { "p_at": string,"p_what": string }; Returns: undefined
                           },
"card_renewals_due":
{ Args: Record<PropertyKey, never>; Returns: {
              "renews_at": string,"subscription_id": string,"user_id": string
            }[]
                           },
"card_restore_after_dispute":
{ Args: { "p_subscription": string }; Returns: undefined
                           },
"casual_access_until":
{ Args: { "p_user": string }; Returns: string
                           },
"casual_ineligibility":
{ Args: { "p_at"?: string,"p_user": string }; Returns: (string)[]
                           },
"check_short_windows":
{ Args: { "p_user": string }; Returns: undefined
                           },
"claim_evidence_path":
{ Args: { "p_claim": string }; Returns: string
                           },
"claim_hook_receipt":
{ Args: { "p_message_id": string }; Returns: boolean
                           },
"claim_photo_upload":
{ Args: { "p_photo_id": string,"p_user_id": string }; Returns: boolean
                           },
"claim_verification_selfie":
{ Args: { "p_user_id": string,"p_verification_id": string }; Returns: boolean
                           },
"close_availability_window":
{ Args: { "p_user": string }; Returns: undefined
                           },
"close_pair":
{ Args: { "p_actor": string,"p_other": string,"p_reason": string }; Returns: undefined
                           },
"complete_photo_upload":
{ Args: { "p_photo_id": string,"p_storage_path": string,"p_user_id": string }; Returns: undefined
                           },
"conversation_other":
{ Args: { "p_conversation": string,"p_viewer": string }; Returns: string
                           },
"conversation_view":
{ Args: { "p_conversation": string,"p_limit"?: number,"p_viewer": string }; Returns: Json
                           },
"conversations_list":
{ Args: { "p_viewer": string }; Returns: {
              "card": Json,"conversation_id": string,"last_body": string,"last_message_at": string,"last_mine": boolean,"photo_path": string,"type": Database["public"]['Enums']["conversation_type"],"unread": number
            }[]
                           },
"current_evidence_id":
{ Args: { "p_claim": string }; Returns: string
                           },
"current_staff_role":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["user_role"]
                           },
"current_user_can_act":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"current_user_status":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["account_status"]
                           },
"delete_photo":
{ Args: { "p_photo_id": string,"p_user_id": string }; Returns: string
                           },
"discover_candidates":
{ Args: { "p_area_id"?: string,"p_interest_ids"?: (string)[],"p_limit"?: number,"p_max_age"?: number,"p_min_age"?: number,"p_viewer": string }; Returns: {
              "card": Json,"photo_path": string
            }[]
                           },
"effective_account_status":
{ Args: { "p_status": Database["public"]['Enums']["account_status"],"p_suspended_until": string }; Returns: Database["public"]['Enums']["account_status"]
                           },
"evidence_due_for_deletion":
{ Args: { "p_limit"?: number }; Returns: {
              "evidence_id": string,"evidence_path": string
            }[]
                           },
"expire_subscriptions":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"file_report":
{ Args: { "p_auto_actions"?: boolean,"p_category": Database["public"]['Enums']["report_category"],"p_conversation": string,"p_description": string,"p_photo_id": string,"p_reporter": string,"p_target": string }; Returns: string
                           },
"get_setting":
{ Args: { "p_key": string }; Returns: Json
                           },
"has_accepted_current_documents":
{ Args: { "p_user_id": string }; Returns: boolean
                           },
"has_active_card_subscription":
{ Args: { "p_user": string }; Returns: boolean
                           },
"has_active_mobile_money_pass":
{ Args: { "p_user": string }; Returns: boolean
                           },
"has_casual_access":
{ Args: { "p_at"?: string,"p_user": string }; Returns: boolean
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
"is_blocked_pair":
{ Args: { "p_a": string,"p_b": string }; Returns: boolean
                           },
"is_in_pool":
{ Args: { "p_at"?: string,"p_user": string }; Returns: boolean
                           },
"is_liberian_phone":
{ Args: { "p_phone": string }; Returns: boolean
                           },
"is_staff":
{ Args: { "p_min_role"?: Database["public"]['Enums']["user_role"] }; Returns: boolean
                           },
"latest_verification_status":
{ Args: { "p_user_id": string }; Returns: string
                           },
"leave_pool":
{ Args: { "p_user": string }; Returns: undefined
                           },
"like_user":
{ Args: { "p_target": string,"p_viewer": string }; Returns: Json
                           },
"likes_received":
{ Args: { "p_viewer": string }; Returns: {
              "card": Json,"liked_at": string,"photo_path": string
            }[]
                           },
"lock_claim_for_decision":
{ Args: { "p_claim": string,"p_statuses": (Database["public"]['Enums']["claim_status"])[] }; Returns: {
              "amount": number,
"created_at": string,
"currency": string,
"evidence_deleted_at": string | null,
"evidence_path": string | null,
"evidence_sha256": string,
"id": string,
"member_note": string | null,
"merchant_account_id": string,
"paid_at": string,
"plan_id": string,
"provider": Database["public"]['Enums']["payment_provider"],
"reference_code": string,
"rejection_reason": Database["public"]['Enums']["claim_rejection_reason"] | null,
"reviewed_at": string | null,
"reviewed_by": string | null,
"sender_phone": string,
"staff_question": string | null,
"status": Database["public"]['Enums']["claim_status"],
"transaction_id": string,
"transaction_key": string,
"updated_at": string,
"user_id": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "payment_claims"
        isOneToOne: true
        isSetofReturn: false
      } },
"log_evidence_view":
{ Args: { "p_claim": string }; Returns: undefined
                           },
"log_invalid_card_webhook":
{ Args: { "p_body": string,"p_processor": string,"p_reason": string }; Returns: boolean
                           },
"log_selfie_view":
{ Args: { "p_verification_id": string }; Returns: undefined
                           },
"mark_conversation_read":
{ Args: { "p_conversation": string,"p_viewer": string }; Returns: undefined
                           },
"mark_evidence_deleted":
{ Args: { "p_evidence_ids": (string)[] }; Returns: number
                           },
"mark_notifications_read":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"mark_processor_cancelled":
{ Args: { "p_processor": string,"p_ref": string }; Returns: undefined
                           },
"mark_selfies_deleted":
{ Args: { "p_verification_ids": (string)[] }; Returns: number
                           },
"matches_list":
{ Args: { "p_viewer": string }; Returns: {
              "card": Json,"conversation_id": string,"has_messages": boolean,"match_id": string,"matched_at": string,"photo_path": string
            }[]
                           },
"member_availability":
{ Args: { "p_user": string }; Returns: Json
                           },
"member_blocked_list":
{ Args: { "p_user_id": string }; Returns: {
              "blocked_at": string,"display_name": string,"user_id": string
            }[]
                           },
"member_cancel_card_subscription":
{ Args: { "p_subscription": string,"p_user": string }; Returns: undefined
                           },
"member_card":
{ Args: { "p_user": string }; Returns: Json
                           },
"member_card_subscription":
{ Args: { "p_user": string }; Returns: {
              "cancel_at_period_end": boolean,"currency": string,"customer_ref": string,"expires_at": string,"id": string,"period_end": string,"plan_name": string,"price": number,"processor": string,"processor_subscription_id": string,"starts_at": string,"status": Database["public"]['Enums']["subscription_status"]
            }[]
                           },
"member_claims":
{ Args: { "p_user": string }; Returns: {
              "amount": number,"claim_id": string,"created_at": string,"currency": string,"plan_name": string,"provider": Database["public"]['Enums']["payment_provider"],"rejection_reason": Database["public"]['Enums']["claim_rejection_reason"],"reviewed_at": string,"staff_question": string,"status": Database["public"]['Enums']["claim_status"],"transaction_id": string
            }[]
                           },
"member_passes":
{ Args: { "p_user": string }; Returns: {
              "amount": number,"currency": string,"expires_at": string,"payment_status": Database["public"]['Enums']["payment_status"],"plan_name": string,"provider": Database["public"]['Enums']["payment_provider"],"source": Database["public"]['Enums']["payment_source"],"starts_at": string,"transaction_id": string
            }[]
                           },
"member_payment_options":
{ Args: { "p_user": string }; Returns: Json
                           },
"member_pending_checkout":
{ Args: { "p_reference": string,"p_user": string }; Returns: {
              "currency": string,"duration_hours": number,"plan_code": string,"price": number,"processor_price_id": string
            }[]
                           },
"member_photos":
{ Args: { "p_user_id": string }; Returns: {
              "id": string,"is_primary": boolean,"rejection_reason": Database["public"]['Enums']["photo_rejection_reason"],"sort_order": number,"status": Database["public"]['Enums']["photo_status"],"storage_path": string
            }[]
                           },
"member_profile_for_viewer":
{ Args: { "p_owner": string,"p_viewer": string }; Returns: Json
                           },
"member_reference_code":
{ Args: { "p_user": string }; Returns: string
                           },
"member_review_status":
{ Args: { "p_user_id": string }; Returns: Json
                           },
"normalize_phone":
{ Args: { "p_phone": string }; Returns: string
                           },
"notify":
{ Args: { "p_payload"?: Json,"p_type": Database["public"]['Enums']["notification_type"],"p_user_id": string }; Returns: undefined
                           },
"onboarding_progress":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"onboarding_progress_for":
{ Args: { "p_user_id": string }; Returns: Json
                           },
"otp_ip_allowed":
{ Args: { "p_ip": string }; Returns: boolean
                           },
"otp_send_allowed":
{ Args: { "p_phone": string }; Returns: boolean
                           },
"pass_user":
{ Args: { "p_target": string,"p_viewer": string }; Returns: undefined
                           },
"pause_availability":
{ Args: { "p_paused": boolean,"p_user": string }; Returns: undefined
                           },
"phone_hash":
{ Args: { "p_phone": string }; Returns: string
                           },
"photos_for_viewer":
{ Args: { "p_owner": string,"p_viewer": string }; Returns: {
              "id": string,"is_primary": boolean,"sort_order": number,"status": Database["public"]['Enums']["photo_status"],"storage_path": string
            }[]
                           },
"primary_photo_path":
{ Args: { "p_user": string }; Returns: string
                           },
"public_plans":
{ Args: Record<PropertyKey, never>; Returns: {
              "code": string,"currency": string,"duration_hours": number,"name": string,"price": number,"source": Database["public"]['Enums']["payment_source"]
            }[]
                           },
"raise_flag":
{ Args: { "p_details"?: Json,"p_entity_id": string,"p_entity_type": string,"p_reason": string }; Returns: undefined
                           },
"rate_limit_count":
{ Args: { "p_bucket": string,"p_subject": string,"p_window_seconds": number }; Returns: number
                           },
"rate_limit_hit":
{ Args: { "p_bucket": string,"p_max": number,"p_subject": string,"p_window_seconds": number }; Returns: boolean
                           },
"recompute_account_state":
{ Args: { "p_user_id": string }; Returns: undefined
                           },
"record_card_charge":
{ Args: { "p_at": string,"p_event": Json,"p_sub": Database["public"]['Tables']["subscriptions"]['Row'] }; Returns: string
                           },
"record_staff_sign_in_failure":
{ Args: { "p_account": string,"p_ip": string }; Returns: undefined
                           },
"reject_payment_claim":
{ Args: { "p_claim": string,"p_reason": Database["public"]['Enums']["claim_rejection_reason"] }; Returns: undefined
                           },
"relationship_compatible":
{ Args: { "p_a": string,"p_b": string }; Returns: boolean
                           },
"relationship_eligible":
{ Args: { "p_user": string }; Returns: boolean
                           },
"relationship_summary":
{ Args: { "p_viewer": string }; Returns: Json
                           },
"release_hook_receipt":
{ Args: { "p_message_id": string }; Returns: undefined
                           },
"release_verification_selfie":
{ Args: { "p_user_id": string,"p_verification_id": string }; Returns: undefined
                           },
"renumber_photos":
{ Args: { "p_user_id": string }; Returns: string
                           },
"reply_payment_claim":
{ Args: { "p_claim": string,"p_evidence_path"?: string,"p_evidence_sha256"?: string,"p_note": string,"p_user": string }; Returns: undefined
                           },
"report_about":
{ Args: { "p_report_id": string,"p_target": string }; Returns: string
                           },
"report_priority_for":
{ Args: { "p_category": Database["public"]['Enums']["report_category"] }; Returns: Database["public"]['Enums']["report_priority"]
                           },
"report_review_paths":
{ Args: { "p_report_id": string }; Returns: {
              "id": string,"is_reported": boolean,"sort_order": number,"status": Database["public"]['Enums']["photo_status"],"storage_path": string
            }[]
                           },
"request_claim_info":
{ Args: { "p_claim": string,"p_question": string }; Returns: undefined
                           },
"resolve_flag":
{ Args: { "p_dismiss": boolean,"p_flag_id": string }; Returns: undefined
                           },
"resolve_report":
{ Args: { "p_dismiss": boolean,"p_photo_reason"?: Database["public"]['Enums']["photo_rejection_reason"],"p_report_id": string,"p_restore_visibility"?: boolean }; Returns: undefined
                           },
"restore_user":
{ Args: { "p_target": string }; Returns: undefined
                           },
"review_photo":
{ Args: { "p_approve": boolean,"p_photo_id": string,"p_reason"?: Database["public"]['Enums']["photo_rejection_reason"] }; Returns: undefined
                           },
"review_photo_paths":
{ Args: { "p_photo_ids": (string)[] }; Returns: {
              "id": string,"storage_path": string
            }[]
                           },
"review_verification":
{ Args: { "p_approve": boolean,"p_reason"?: Database["public"]['Enums']["verification_rejection_reason"],"p_verification_id": string }; Returns: undefined
                           },
"save_interests_and_bio":
{ Args: { "p_bio": string,"p_interest_ids": (string)[],"p_user_id": string }; Returns: undefined
                           },
"save_profile_basics":
{ Args: { "p_area_id": string,"p_display_name": string,"p_gender": Database["public"]['Enums']["gender"],"p_intent_casual": boolean,"p_intent_relationship": boolean,"p_seeking_genders": (Database["public"]['Enums']["gender"])[],"p_user_id": string }; Returns: undefined
                           },
"selfies_due_for_deletion":
{ Args: { "p_limit"?: number }; Returns: {
              "storage_path": string,"verification_id": string
            }[]
                           },
"send_message":
{ Args: { "p_body": string,"p_categories"?: (string)[],"p_conversation": string,"p_flagged"?: boolean,"p_viewer": string }; Returns: Json
                           },
"set_availability":
{ Args: { "p_end": string,"p_start": string,"p_user": string }; Returns: Json
                           },
"set_casual_message_permission":
{ Args: { "p_permission": Database["public"]['Enums']["message_permission"],"p_user": string }; Returns: undefined
                           },
"set_date_of_birth":
{ Args: { "p_dob": string }; Returns: undefined
                           },
"set_primary_photo":
{ Args: { "p_photo_id": string,"p_user_id": string }; Returns: undefined
                           },
"staff_claim_detail":
{ Args: { "p_claim": string }; Returns: Json
                           },
"staff_claims_queue":
{ Args: { "p_limit"?: number }; Returns: {
              "amount": number,"claim_id": string,"created_at": string,"currency": string,"flags": number,"plan_name": string,"provider": Database["public"]['Enums']["payment_provider"],"status": Database["public"]['Enums']["claim_status"],"user_id": string
            }[]
                           },
"staff_flags_queue":
{ Args: { "p_limit"?: number }; Returns: {
              "account_id": string,"account_status": Database["public"]['Enums']["account_status"],"created_at": string,"display_name": string,"entity_id": string,"entity_type": string,"flag_id": string,"hidden_reason": string,"reason": string,"stored_status": Database["public"]['Enums']["account_status"],"suspended_until": string
            }[]
                           },
"staff_photo_queue":
{ Args: { "p_limit"?: number }; Returns: {
              "age": number,"approved_count": number,"display_name": string,"is_primary": boolean,"photo_id": string,"sort_order": number,"uploaded_at": string,"user_id": string
            }[]
                           },
"staff_queue_counts":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"staff_report_detail":
{ Args: { "p_report_id": string }; Returns: Json
                           },
"staff_report_messages":
{ Args: { "p_report_id": string }; Returns: {
              "body": string,"from_reported": boolean,"sent_at": string
            }[]
                           },
"staff_reports_queue":
{ Args: { "p_include_closed"?: boolean,"p_limit"?: number,"p_member"?: string }; Returns: {
              "category": Database["public"]['Enums']["report_category"],"created_at": string,"priority": Database["public"]['Enums']["report_priority"],"report_id": string,"reported_user_id": string,"reporters_24h": number,"status": Database["public"]['Enums']["report_status"],"target_hidden": string
            }[]
                           },
"staff_sign_in_allowed":
{ Args: { "p_account": string,"p_ip": string }; Returns: boolean
                           },
"staff_verification_detail":
{ Args: { "p_verification_id": string }; Returns: Json
                           },
"staff_verification_queue":
{ Args: { "p_limit"?: number }; Returns: {
              "age": number,"display_name": string,"escalated": boolean,"previous_rejections": number,"submitted_at": string,"user_id": string,"verification_id": string
            }[]
                           },
"start_card_checkout":
{ Args: { "p_plan_code": string,"p_processor": string,"p_user": string }; Returns: Json
                           },
"start_verification":
{ Args: { "p_user_id": string }; Returns: {
              "pose_prompt": string,"verification_id": string
            }[]
                           },
"submit_conversation_report":
{ Args: { "p_category": Database["public"]['Enums']["report_category"],"p_conversation": string,"p_description"?: string,"p_reporter": string }; Returns: string
                           },
"submit_payment_claim":
{ Args: { "p_evidence_path": string,"p_evidence_sha256": string,"p_paid_at": string,"p_plan_id": string,"p_provider": Database["public"]['Enums']["payment_provider"],"p_sender_phone": string,"p_transaction_id": string,"p_user": string }; Returns: string
                           },
"submit_report":
{ Args: { "p_category": Database["public"]['Enums']["report_category"],"p_description"?: string,"p_photo_id"?: string,"p_reporter": string,"p_target": string }; Returns: string
                           },
"submit_verification":
{ Args: { "p_storage_path": string,"p_user_id": string,"p_verification_id": string }; Returns: undefined
                           },
"suspend_user":
{ Args: { "p_report_id"?: string,"p_target": string,"p_until": string }; Returns: undefined
                           },
"tidy_availability":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"transaction_key":
{ Args: { "p_txn": string }; Returns: string
                           },
"unblock_user":
{ Args: { "p_target": string,"p_user_id": string }; Returns: undefined
                           },
"unhide_member":
{ Args: { "p_target": string }; Returns: undefined
                           },
"unmatch":
{ Args: { "p_match_id": string,"p_viewer": string }; Returns: undefined
                           },
"verification_review_paths":
{ Args: { "p_verification_id": string }; Returns: {
              "id": string,"is_primary": boolean,"kind": string,"sort_order": number,"status": Database["public"]['Enums']["photo_status"],"storage_path": string
            }[]
                           },
"viewed_current_evidence":
{ Args: { "p_claim": string }; Returns: boolean
                           }
          }
          Enums: {
            "account_status": "PENDING"|"ACTIVE"|"SUSPENDED"|"BANNED"|"DELETED","audit_action": "USER_SUSPENDED"|"USER_BANNED"|"USER_RESTORED"|"VERIFICATION_APPROVED"|"VERIFICATION_REJECTED"|"SELFIE_VIEWED"|"PHOTO_APPROVED"|"PHOTO_REJECTED"|"DOB_CORRECTED"|"SUBSCRIPTION_MODIFIED"|"PAYMENT_REFUNDED"|"PAYMENT_CLAIM_APPROVED"|"PAYMENT_CLAIM_REJECTED"|"PAYMENT_CLAIM_NEEDS_INFO"|"EVIDENCE_VIEWED"|"REPORT_RESOLVED"|"SETTING_CHANGED"|"ROLE_CHANGED"|"ADMIN_CREATED"|"REPORTED_MESSAGES_VIEWED","availability_status": "UNAVAILABLE"|"AVAILABLE"|"PAUSED","claim_rejection_reason": "TRANSACTION_NOT_FOUND"|"AMOUNT_MISMATCH"|"ALREADY_USED"|"DETAILS_DO_NOT_MATCH"|"EVIDENCE_UNCLEAR","claim_status": "PENDING_REVIEW"|"NEEDS_INFO"|"APPROVED"|"REJECTED"|"CANCELLED","consent_document": "TERMS"|"PRIVACY"|"RULES","conversation_status": "OPEN"|"CLOSED","conversation_type": "RELATIONSHIP"|"CASUAL","flag_status": "OPEN"|"RESOLVED"|"DISMISSED","gender": "WOMAN"|"MAN","geo_result": "PASS"|"BLOCKED_COUNTRY"|"BLOCKED_PHONE"|"BLOCKED_LIST"|"RATE_LIMITED","match_status": "ACTIVE"|"UNMATCHED","message_permission": "ANYONE"|"NOBODY","notification_type": "VERIFICATION_APPROVED"|"VERIFICATION_REJECTED"|"PHOTO_REJECTED"|"ACCOUNT_ACTIVE"|"PAYMENT_APPROVED"|"PAYMENT_REJECTED"|"PAYMENT_NEEDS_INFO","payment_provider": "ORANGE_MONEY"|"MTN_MOMO"|"CARD","payment_source": "MOBILE_MONEY"|"CARD","payment_status": "PENDING"|"SUCCEEDED"|"FAILED"|"REFUNDED","photo_rejection_reason": "FACE_NOT_CLEAR"|"NUDITY_OR_SEXUAL"|"TEXT_OR_CONTACT"|"CHILD_IN_PHOTO"|"NOT_THE_MEMBER"|"POOR_QUALITY","photo_status": "UPLOADING"|"PENDING_REVIEW"|"APPROVED"|"REJECTED"|"HIDDEN"|"DELETED","report_category": "UNDER_18"|"SELLING_SEX"|"MONEY_SCAM"|"THREATS_HARASSMENT"|"FAKE_PROFILE"|"INAPPROPRIATE_PHOTO"|"SPAM"|"OTHER","report_priority": "HIGH"|"MEDIUM"|"LOW","report_status": "OPEN"|"RESOLVED"|"DISMISSED","subscription_status": "PENDING"|"ACTIVE"|"CANCELLED"|"PAYMENT_FAILED"|"EXPIRED"|"SUSPENDED"|"REFUNDED","user_role": "USER"|"MODERATOR"|"ADMIN"|"SUPER_ADMIN","verification_rejection_reason": "POSE_NOT_MATCHING"|"NOT_SAME_PERSON"|"AGE_DOUBT"|"NOT_LIVE"|"UNCLEAR","verification_status": "AWAITING_SELFIE"|"PENDING"|"VERIFIED"|"REJECTED"
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
            "account_status": ["PENDING", "ACTIVE", "SUSPENDED", "BANNED", "DELETED"],"audit_action": ["USER_SUSPENDED", "USER_BANNED", "USER_RESTORED", "VERIFICATION_APPROVED", "VERIFICATION_REJECTED", "SELFIE_VIEWED", "PHOTO_APPROVED", "PHOTO_REJECTED", "DOB_CORRECTED", "SUBSCRIPTION_MODIFIED", "PAYMENT_REFUNDED", "PAYMENT_CLAIM_APPROVED", "PAYMENT_CLAIM_REJECTED", "PAYMENT_CLAIM_NEEDS_INFO", "EVIDENCE_VIEWED", "REPORT_RESOLVED", "SETTING_CHANGED", "ROLE_CHANGED", "ADMIN_CREATED", "REPORTED_MESSAGES_VIEWED"],"availability_status": ["UNAVAILABLE", "AVAILABLE", "PAUSED"],"claim_rejection_reason": ["TRANSACTION_NOT_FOUND", "AMOUNT_MISMATCH", "ALREADY_USED", "DETAILS_DO_NOT_MATCH", "EVIDENCE_UNCLEAR"],"claim_status": ["PENDING_REVIEW", "NEEDS_INFO", "APPROVED", "REJECTED", "CANCELLED"],"consent_document": ["TERMS", "PRIVACY", "RULES"],"conversation_status": ["OPEN", "CLOSED"],"conversation_type": ["RELATIONSHIP", "CASUAL"],"flag_status": ["OPEN", "RESOLVED", "DISMISSED"],"gender": ["WOMAN", "MAN"],"geo_result": ["PASS", "BLOCKED_COUNTRY", "BLOCKED_PHONE", "BLOCKED_LIST", "RATE_LIMITED"],"match_status": ["ACTIVE", "UNMATCHED"],"message_permission": ["ANYONE", "NOBODY"],"notification_type": ["VERIFICATION_APPROVED", "VERIFICATION_REJECTED", "PHOTO_REJECTED", "ACCOUNT_ACTIVE", "PAYMENT_APPROVED", "PAYMENT_REJECTED", "PAYMENT_NEEDS_INFO"],"payment_provider": ["ORANGE_MONEY", "MTN_MOMO", "CARD"],"payment_source": ["MOBILE_MONEY", "CARD"],"payment_status": ["PENDING", "SUCCEEDED", "FAILED", "REFUNDED"],"photo_rejection_reason": ["FACE_NOT_CLEAR", "NUDITY_OR_SEXUAL", "TEXT_OR_CONTACT", "CHILD_IN_PHOTO", "NOT_THE_MEMBER", "POOR_QUALITY"],"photo_status": ["UPLOADING", "PENDING_REVIEW", "APPROVED", "REJECTED", "HIDDEN", "DELETED"],"report_category": ["UNDER_18", "SELLING_SEX", "MONEY_SCAM", "THREATS_HARASSMENT", "FAKE_PROFILE", "INAPPROPRIATE_PHOTO", "SPAM", "OTHER"],"report_priority": ["HIGH", "MEDIUM", "LOW"],"report_status": ["OPEN", "RESOLVED", "DISMISSED"],"subscription_status": ["PENDING", "ACTIVE", "CANCELLED", "PAYMENT_FAILED", "EXPIRED", "SUSPENDED", "REFUNDED"],"user_role": ["USER", "MODERATOR", "ADMIN", "SUPER_ADMIN"],"verification_rejection_reason": ["POSE_NOT_MATCHING", "NOT_SAME_PERSON", "AGE_DOUBT", "NOT_LIVE", "UNCLEAR"],"verification_status": ["AWAITING_SELFIE", "PENDING", "VERIFIED", "REJECTED"]
          }
        }
} as const
