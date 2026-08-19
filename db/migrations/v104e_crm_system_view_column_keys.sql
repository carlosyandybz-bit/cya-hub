update public.crm_saved_views set columns = case view_key
  when 'interested_no_booking' then '["display_name","phone","reservation","interest","no_booking_reason"]'::jsonb
  when 'interested_no_booking_missing_reason' then '["display_name","phone","reservation","interest","no_booking_reason"]'::jsonb
  when 'lost_location' then '["display_name","phone","location","reservation","no_booking_reason"]'::jsonb
  when 'lost_price' then '["display_name","phone","reservation","no_booking_reason"]'::jsonb
  when 'lost_schedule' then '["display_name","phone","reservation","no_booking_reason"]'::jsonb
  when 'new_unclassified' then '["display_name","phone","email","interest"]'::jsonb
  when 'next_class' then '["display_name","phone","reservation","next_class"]'::jsonb
  when 'no_next_class' then '["display_name","phone","reservation","last_class"]'::jsonb
  when 'online_content_interest' then '["display_name","phone","email","online_content"]'::jsonb
  when 'questionnaire_pending_next_class' then '["display_name","phone","next_class","questionnaire"]'::jsonb
  when 'teacher_training_interest' then '["display_name","phone","email","teacher_training"]'::jsonb
  else columns end,
  updated_at = now()
where is_system and active;
