# About

> [!WARNING]  
> This package is under active development. I believe it is ready for "bleeding
> edge" use, but its API may have to change, based on findings and bugs.
> Please use with caution.

`dbus-victron-virtual` is a wrapper around
[dbus-native](https://www.npmjs.com/package/dbus-native), which allows you to
connect to [dbus](https://www.freedesktop.org/wiki/Software/dbus/), and
simplify integrating with the [Victron](https://www.victronenergy.com/)
infrastructure: To do this, `dbus-victron-virtual` provides functions to

- expose your dbus interface as a Victron service, by implementing the dbus interface `com.victronenergy.BusItem`,
- emit the Victron-specific event `ItemsChanged`, and
- define and modify settings which are then available through Victron's settings interface.

See `dbus-victron-virtual` in action [here](https://github.com/Chris927/dbus-victron-virtual-test).

This package may be for you if

- you want to define virtual devices for testing on a Victron device, like a [Victron Cerbo GX](https://www.victronenergy.com/media/pg/Cerbo_GX/en/index-en.html), e.g. to use it in [Node-RED](https://www.victronenergy.com/live/venus-os:large), or
- you need to integrate a device via dbus that is not (yet) supported by Victron natively.

# Usage

## Prerequisites

You have a NodeJS project you want to run on [Venus
OS](https://github.com/victronenergy/venus), and you want to communicate with
the local dbus.

## Setup Up

- Add this package as a dependency: `npm add dbus-victron-virtual`.
- Use this package, by importing or requiring it: `const { addVictronInterfaces } = require('dbus-victron-virtual');`
- Make sure you understand how to use this package by studying the [example](https://github.com/Chris927/dbus-victron-virtual-test).
- Have fun.

# Development

## Prerequisites

You can develop on a device that runs [Venus OS](https:/.com/victronenergy/venus). This way, the dbus environment as required by this package will be available. Alternatively, you can develop in any environment that support node 18 or higher, but you won't be able to run integration tests.

## Steps

- clone the repository
- `npm install`

The implementation is in `./src/index.js`, tests are in `./src/__tests__`.

## Testing

- `npm run test`
- run tests and include running integration tests with `DBUS_SESSION_BUS_ADDRESS=unix:socket=/var/run/dbus/system_bus_socket TEST_INTEGRATION=1 npm run test`

To run only the integration tests, use [jest's](https://jestjs.io/docs/cli) `-t` option, and specify which host/port to use (if running remotely):

```bash
DBUS_ADDRESS='tcp:host=venus.local,port=78' TEST_INTEGRATION=1 npm run test -- -t 'integration'
```

Test coverage stats for unit and integration tests (append ` -- --coverage` to the test command):


## Test Coverage

Coverage as per v0.1.17:

----------|---------|----------|---------|---------|-----------------------------------------------------------------------
File      | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
----------|---------|----------|---------|---------|-----------------------------------------------------------------------
All files |   85.85 |    77.22 |      80 |   85.71 |
 index.js |   85.85 |    77.22 |      80 |   85.71 | 27-40,65,71,76,94,186,210,221,266-297,331-334,338-342,380,429,545-547
----------|---------|----------|---------|---------|-----------------------------------------------------------------------

