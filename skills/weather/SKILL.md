---
name: weather
description: "Get current weather and forecasts for any location via wttr.in. No API key needed."
---

# Weather Skill

Get current weather and forecasts for any location.

## Usage

Ask the agent: "What's the weather in Beijing?" or "天气怎么样"

## Implementation

This skill uses wttr.in (curl-friendly weather service, no API key required).

For the actual weather fetching logic, the agent uses web_fetch or direct HTTP requests to wttr.in at these endpoints:

- Current conditions: `https://wttr.in/{location}?format=%C+%t+%h+%w&m`
- Full forecast: `https://wttr.in/{location}?m`

The `%C` = weather condition, `%t` = temperature, `%h` = humidity, `%w` = wind. The `&m` flag sets units to metric.
