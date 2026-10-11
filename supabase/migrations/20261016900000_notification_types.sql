-- Phase 11 notification types, in their own migration so 20261017000000_notifications.sql can index them.
alter type public.notification_type add value if not exists 'REQUEST_RECEIVED';
alter type public.notification_type add value if not exists 'REQUEST_ACCEPTED';
alter type public.notification_type add value if not exists 'MATCH_CREATED';
alter type public.notification_type add value if not exists 'MESSAGE_RECEIVED';
alter type public.notification_type add value if not exists 'PASS_EXPIRING';
alter type public.notification_type add value if not exists 'CARD_RENEWAL_REMINDER';
