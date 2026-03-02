# Home Assistant compatibility report (generated)

Date: 2026-03-01

## Core + dependency versions detected

- Home Assistant Core: `2026.2.3`
- HACS: `2.0.5` (storage mode)
- card-mod: `v4.2.1`
- Mushroom: `v5.0.12` (update available: `v5.1.1`)
- state-switch: `1.9.6`
- Bubble Card: `v3.1.1`
- button-card: `v7.0.1`
- browser_mod: `v2.7.4`

## Entity readiness check (Media Centre card scope)

Found in your HA:
- `media_player.homepod`
- `media_player.homepod_mini`
- `input_text.announcement_message`
- `input_boolean.mic_recording`
- `input_text.music_request_query`
- `input_text.last_music_request`
- `input_select.music_target_speaker`
- `input_select.music_transfer_targets`
- `input_select.intercom_source`
- `input_select.intercom_target`

Missing in your HA (auto-generated package included to create/provide these):
- `sensor.active_echo_player`
- `script.make_an_announcement`
- `script.play_requested_music`
- `script.transfer_music_to_echo`
- `script.initiate_intercom`
- `input_select.alexa_popup_tab`
- `input_select.alexa_alarm_device`
- `input_select.alarm_hour`
- `input_number.alarm_minute`
- `input_select.alarm_period`
- `script.set_alexa_alarm`
- `input_select.alexa_timer_device`
- `input_number.alexa_timer_value`
- `input_select.alexa_timer_unit`
- `script.set_alexa_timer`
- `input_select.alexa_reminder_device`
- `input_text.alexa_reminder_text`
- `script.set_alexa_reminder`
- `event.top_stories_google_news`
- `input_boolean.5_second_timer`

## What was generated

1. `generated/cards/3 - Media Centre Card.salva.yaml`
   - Adapted from upstream card
   - Replaced `media_player.*_echo` references with your HomePods

2. `generated/packages/abode_media_helpers_salva.yaml`
   - Template sensor: `sensor.active_echo_player`
   - Missing helper entities (`input_text`, `input_boolean`, `input_select`, `input_number`)
   - Script stubs for announcement/music/intercom/alarm/timer/reminder

## Notes / limitations

- This is a compatibility-first migration for your environment; it preserves card structure and injects missing helpers/scripts.
- `event.top_stories_google_news` remains external and depends on your own event source.
- Full repository-wide migration (all 8 cards) needs a second pass because many entities are home-specific and absent in your HA.
