---
description: Send push notifications to your iOS / Android phones using
  Signalgrid.
homepage: "https://web.signalgrid.co"
metadata:
  clawdbot:
    emoji: 📲
    primaryEnv: SIGNALGRID_CLIENT_KEY
    requires:
      bins:
      - node
      env:
      - SIGNALGRID_CLIENT_KEY
      - SIGNALGRID_CHANNEL
name: signalgrid-push
---

# Signalgrid Push

Send push notifications to your phone through the Signalgrid API.


## Examples

Send a simple notification:

``` bash
node {baseDir}/skills/signalgrid-push/signalgrid-push.js --title "OpenClaw" --body "Hello from OpenClaw" --type INFO
```
  
Send a deployment notification:

``` bash
node {baseDir}/skills/signalgrid-push/signalgrid-push.js --title "Deployment" --body "Build finished successfully" --type INFO
```
    
Send a critical notification:

``` bash
node {baseDir}/skills/signalgrid-push/signalgrid-push.js --title "Attention" --body "This is a critical one" --type INFO --critical true
```

## Options

-   `--title <title>`: Notification title (required)
-   `--body <body>`: Main message (required)
-   `--type <type>`: Notification type --- `crit`, `warn`, `success`,
    `info`
-   `--critical <bool>`: Emergency bypass flag (optional)

## When to use

Use this skill when the user asks to:

-   send a notification
-   notify me
-   send a push
-   push a message
-   alert me
-   send a signalgrid notification
-   notify my phone

## Notes

-   Requires a Signalgrid account: https://web.signalgrid.co/
-   Install the skill:

``` bash
clawdhub --workdir ~/.openclaw install signalgrid-push
```

-   Ensure your OpenClaw **Tool Profile** is set to `full`
-   Configure environment variables:

```
    SIGNALGRID_CLIENT_KEY=your_client_key_here
    SIGNALGRID_CHANNEL=your_channel_name_here
````

-   Signalgrid notifications do **not** require a phone number or
    message target.