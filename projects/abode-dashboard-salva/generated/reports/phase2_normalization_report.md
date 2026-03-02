# Phase 2 normalization report

Applied fallback replacements for missing entities to make cards runnable for testing.

- Missing entities replaced: {len(rep)}
- Output folder: `generated/cards-phase2/`

## Fallback map
- `media_player.*` -> `media_player.homepod`
- `sensor.*` -> `sensor.time`
- `binary_sensor.*` -> `binary_sensor.kitchen_dining_living_fp2_overallpresence`
- `light.*` -> `light.lamp`
- `switch.*` -> `switch.smart_switch_2211283432205855080548e1e9b1820f_outlet`
- `script.*` -> `script.play_requested_music`
- `input_text.*` -> `input_text.music_request_query`
- `input_boolean.*` -> `input_boolean.mic_recording`
- `input_select.*` -> `input_select.music_target_speaker`
- `input_number.*` -> `input_number.alexa_timer_value`
- `camera.*` -> `camera.front_door_bell_live_view`
- `event.*` -> `sensor.time`
- `person.*` -> `person.salva`
- `zone.*` -> `zone.home`
- `weather.*` -> `weather.forecast_abode`
- `cover.*` -> `cover.lounge_shutter`
- `fan.*` -> `fan.study_fan`
- `automation.*` -> `automation.washing_machine_vibration_sensor`
- `alarm_control_panel.*` -> `alarm_control_panel.alarmo`
- `lock.*` -> `lock.front_door_lock_ultra`
- `update.*` -> `update.home_assistant_core_update`
- `device_tracker.*` -> `person.salva`
- `calendar.*` -> `sensor.time`
- `scene.*` -> `sensor.time`
- `timer.*` -> `sensor.time`
- `vacuum.*` -> `sensor.time`
- `select.*` -> `input_select.music_target_speaker`
- `number.*` -> `input_number.alexa_timer_value`
- `button.*` -> `sensor.time`
- `remote.*` -> `media_player.homepod`
- `tts.*` -> `media_player.homepod`
- `todo.*` -> `sensor.time`
- `image.*` -> `camera.front_door_bell_live_view`
- `sun.*` -> `sun.sun`