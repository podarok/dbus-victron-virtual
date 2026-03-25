const debug = require("debug")("dbus-victron-virtual");
const debugS2 = require("debug")("dbus-victron-virtual:s2");
const path = require("path");
const packageJson = require(path.join(__dirname, "../", "package.json"));

const products = {
  temperature: { id: 0xc060, name: 'temperature sensor' },
  meteo: { id: 0xc061 },
  grid: { id: 0xc062, name: 'grid meter' },
  tank: { id: 0xc063, name: 'tank sensor' },
  heatpump: { id: 0xc064 },
  battery: { id: 0xc065 },
  pvinverter: { id: 0xc066, name: 'PV inverter' },
  ev: { id: 0xc067, name: 'EV' },
  gps: { id: 0xc068, name: 'GPS' },
  'switch': { id: 0xc069 },
  acload: { id: 0xc06a, name: 'AC load' },
  genset: { id: 0xc06b },
  motordrive: { id: 0xc06c, name: 'E-drive' },
  dcgenset: { id: 0xc06d, name: 'DC genset' },
  dcload: { id: 0xc06e, name: 'DC load' },
  energymeter: { id: 0xc06f, name: 'energy meter' },
};

function getType(value) {
  return value === null
    ? "d"
    : typeof value === "undefined"
      ? (() => {
        throw new Error("Value cannot be undefined");
      })()
      : typeof value === "string"
        ? "s"
        : typeof value === "number"
          ? isNaN(value)
            ? (() => {
              throw new Error("NaN is not a valid input");
            })()
            : Number.isInteger(value)
              ? "i"
              : "d"
          : (() => {
            throw new Error("Unsupported type: " + typeof value);
          })();
}

function wrapValue(t, v) {
  if (v === null) {
    return ["ai", []];
  }
  switch (t) {
    case "b":
      return ["b", v];
    case "s":
      return ["s", v];
    case "i":
      return ["i", v];
    case "d":
      return ["d", v];
    case "ad":
      if (!Array.isArray(v)) {
        throw new Error('value must be an array for type "ad"');
      }
      for (const item of v) {
        if (typeof item !== "number") {
          throw new Error('all items in array must be numbers for type "ad"');
        }
      }
      return ["ad", v];
    case "ai":
      if (!Array.isArray(v)) {
        throw new Error('value must be an array for type "ai"');
      }
      for (const item of v) {
        if (!Number.isInteger(item)) {
          throw new Error('all items in array must be integers for type "ai"');
        }
      }
      return ["ai", v];
    case "as":
      if (!Array.isArray(v)) {
        throw new Error('value must be an array for type "as"');
      }
      for (const item of v) {
        if (typeof item !== "string") {
          throw new Error('all items in array must be strings for type "as"');
        }
      }
      return ["as", v];
    default:
      return t.type ? wrapValue(t.type, v) : v;
  }
}

function unwrapValue([t, v]) {
  switch (t[0].type) {
    case "b":
      return !!v[0];
    case "s":
      return v[0];
    case "i":
      return Number(v[0]);
    case "d":
      return Number(v[0]);
    case "ad":
      return v[0]; // Return the array of doubles directly
    case "ai":
      if (v.length === 1 && v[0].length === 0) {
        return null;
      }
      return v[0]; // Return the array of integers directly
    case "as":
      for (const item of v[0]) {
        if (typeof item !== "string") {
          throw new Error('All items in string array must be strings');
        }
      }
      return v[0];
    case "a":
      try {
        if (!t[0].child || !t[0].child[0] || !t[0].child[0].type) {
          throw new Error('Array type information missing');
        }

        const valueType = t[0].child[0].type;
        const arrayLength = (v.length === 1 && v[0]) ? v[0].length : 0;

        if (v.length === 1 && arrayLength === 0 && valueType === 'i') {
          return null;
        }

        if (v.length === 1 && arrayLength > 0 && (valueType === 'i' || valueType === 'd')) {
          return v[0];
        }

        throw new Error(`Unsupported array type. ValueType: ${valueType}, length: ${arrayLength}`);
      } catch (e) {
        console.error(e);
        throw new Error(
          'Unable to unwrap array value: ' + e
        )
      }
    default:
      throw new Error(`Unsupported value type: ${JSON.stringify(t)}`);
  }
}

/** validate and possibly convert a new number, received through SetValue or otherwise */
function validateNewNumber(name, declaration, value) {
  const number = Number(value);
  if (isNaN(number)) {
    throw new Error(`value for ${name} is not a number.`);
  }
  if (declaration.max !== undefined && number > declaration.max) {
    throw new Error(`value for ${name} is too large`);
  }
  if (declaration.min !== undefined && number < declaration.min) {
    throw new Error(`value for ${name} is too small`);
  }
  if (declaration.type === "i") {
    return Math.floor(number);
  } else {
    return number;
  }
}

/** validate and possibly convert a new value (received through SetValue or otherwise) */
function validateNewValue(name, declaration, value) {

  debug('validateNewValue called, name:', name, 'declaration:', declaration, 'value:', value);

  // we allow the declaration to be just a type ('s' or 'i'), or an object with a 'type'property, e.g. { type: 's' }.
  const type = declaration.type === undefined ? declaration : declaration.type;

  // we always allow a null value
  if (value === null) {
    return null;
  }

  try {
    switch (type) {
      case 'b':
        // we allow boolean values to be set as strings or numbers as well
        if (value === true || value == 'true' || value == '1') {
          return true
        } else if (value === false || value == 'false' || value == '0') {
          return false
        }
        throw new Error(`validation failed for ${name}, type ${declaration.type}, check logs for details.`)
      case 'i':
      case 'd':
        if (Array.isArray(value) && value.length > 0) {
          throw new Error(`value for ${name} cannot be an array`);
        }
        return validateNewNumber(name, declaration, value);
      case 'ad':
        if (!Array.isArray(value)) {
          throw new Error(`value for ${name} must be an array`);
        }
        return value.map((item) =>
          validateNewNumber(name, { type: 'd', min: declaration.min, max: declaration.max }, item)
        );
      case 'ai':
        if (!Array.isArray(value)) {
          throw new Error(`value for ${name} must be an array`);
        }
        return value.map((item) =>
          validateNewNumber(name, { type: 'i', min: declaration.min, max: declaration.max }, item)
        );
      case 'as':
        if (!Array.isArray(value)) {
          throw new Error(`value for ${name} must be an array`);
        }
        for (const item of value) {
          if (typeof item !== "string") {
            throw new Error(`all items in array for ${name} must be strings`);
          }
        }
        return value;
      case 's':
        if (Array.isArray(value) && value.length > 0) {
          throw new Error(`value for ${name} cannot be an array`);
        }
        return '' + value;
      default:
        return '' + value;
    }
  } catch (e) {
    console.warn(
      `validation failed for property ${name}, value:`, value
    )
    throw e
  }
}

async function addSettings(bus, settings) {
  const body = [
    settings.map((setting) => [
      ["path", wrapValue("s", setting.path)],
      [
        "default",
        wrapValue(
          typeof setting.type !== "undefined"
            ? setting.type
            : getType(setting.default),
          setting.default,
        ),
      ],
      ["min", wrapValue(setting.type || "d", setting.min !== undefined ? setting.min : null)],
      ["max", wrapValue(setting.type || "d", setting.max !== undefined ? setting.max : null)],
    ]),
  ];
  return await new Promise((resolve, reject) => {
    bus.invoke(
      {
        interface: "com.victronenergy.Settings",
        path: "/",
        member: "AddSettings",
        destination: "com.victronenergy.settings",
        type: undefined,
        signature: "aa{sv}",
        body: body,
      },
      function(err, result) {
        if (err) {
          return reject(err);
        }
        return resolve(result);
      },
    );
  });
}

async function removeSettings(bus, settings) {
  const body = [settings.map((setting) => setting.path)];

  return new Promise((resolve, reject) => {
    bus.invoke(
      {
        interface: "com.victronenergy.Settings",
        path: "/",
        member: "RemoveSettings",
        destination: "com.victronenergy.settings",
        type: undefined,
        signature: "as",
        body: body,
      },
      function(err, result) {
        if (err) {
          return reject(err);
        }
        return resolve(result);
      },
    );
  });
}

async function setValue(bus, { path, interface_, destination, value, type }) {
  return await new Promise((resolve, reject) => {
    if (path === "/DeviceInstance") {
      console.warn(
        "setValue called for path /DeviceInstance, this will be ignored by Victron services.",
      );
    }
    bus.invoke(
      {
        interface: interface_,
        path: path || "/",
        member: "SetValue",
        destination,
        signature: "v",
        body: [
          wrapValue(typeof type !== "undefined" ? type : getType(value), value),
        ],
      },
      function(err, result) {
        if (err) {
          return reject(err);
        }
        resolve(result);
      },
    );
  });
}

async function getValue(bus, { path, interface_, destination }) {
  return await new Promise((resolve, reject) => {
    bus.invoke(
      {
        interface: interface_,
        path: path || "/",
        member: "GetValue",
        destination,
      },
      function(err, result) {
        if (err) {
          return reject(err);
        }
        resolve(result);
      },
    );
  });
}

async function getMin(bus, { path, interface_, destination }) {
  return await new Promise((resolve, reject) => {
    bus.invoke(
      {
        interface: interface_,
        path: path || "/",
        member: "GetMin",
        destination,
      },
      function(err, result) {
        if (err) {
          return reject(err);
        }
        resolve(result);
      },
    );
  });
}

async function getMax(bus, { path, interface_, destination }) {
  return await new Promise((resolve, reject) => {
    bus.invoke(
      {
        interface: interface_,
        path: path || "/",
        member: "GetMax",
        destination,
      },
      function(err, result) {
        if (err) {
          return reject(err);
        }
        resolve(result);
      },
    );
  });
}

function addVictronInterfaces(
  bus,
  declaration,
  definition,
  add_defaults = true,
  emitCallback = null
) {
  const warnings = [];

  if (!declaration.name) {
    throw new Error("Interface name is required");
  }

  if (!declaration.name.match(/^[a-zA-Z0-9_.]+$/)) {
    warnings.push(
      `Interface name contains problematic characters, only a-zA-Z0-9_ allowed.`,
    );
  }
  if (!declaration.name.match(/^com.victronenergy/)) {
    warnings.push("Interface name should start with com.victronenergy");
  }

  debug(`addVictronInterfaces:`, declaration, definition, add_defaults);

  function addDefaults() {
    debug("addDefaults, declaration.name:", declaration.name);
    const productInName = declaration.name.split(".")[2];
    if (!productInName) {
      console.warn(
        `Unable to extract product from name, ensure name is of the form 'com.victronenergy.product.my_name', declaration.name=${declaration.name}`
      );
      return;
    }
    const product = products[productInName];
    if (!product) {
      const productNames = Object.keys(products);
      console.warn(
        `Invalid product ${productInName}, ensure product name is in ${productNames.join(", ")}`,
      );
      return;
    }
    declaration["properties"]["Mgmt/Connection"] = { type: "s", readonly: true };
    definition["Mgmt/Connection"] = "Node-RED";
    declaration["properties"]["Mgmt/ProcessName"] = { type: "s", readonly: true };
    definition["Mgmt/ProcessName"] = packageJson.name;
    declaration["properties"]["Mgmt/ProcessVersion"] = { type: "s", readonly: true };
    definition["Mgmt/ProcessVersion"] = packageJson.version;

    declaration["properties"]["ProductId"] = {
      type: "i",
      format: (/* v */) => product['id'].toString(16),
      readonly: true
    };
    definition["ProductId"] = products[declaration["name"].split(".")[2]]['id'];
    declaration["properties"]["ProductName"] = { type: "s", readonly: true };
    definition["ProductName"] = 'Virtual ' + (product.name ? product.name : declaration["name"].split(".")[2]);
  }

  if (add_defaults == true) {
    addDefaults();
  }

  const getFormatFunction = (v) => {
    if (v.format && typeof v.format === "function") {
      // Wrap the custom format function to ensure it always returns a string
      return (value) => {
        const formatted = v.format(value);
        return formatted != null ? String(formatted) : "";
      };
    } else {
      return (value) => {
        if (value == null) return "";

        let stringValue = String(value);

        // Handle potential type mismatches
        switch (v.type) {
          case "d": // double/float
            return isNaN(parseFloat(stringValue)) ? "" : stringValue;
          case "i": // integer
            return isNaN(parseInt(stringValue, 10)) ? "" : stringValue;
          case "s": // string
            return stringValue;
          default:
            return stringValue;
        }
      };
    }
  };

  // we use this for GetItems and ItemsChanged.
  function getProperties(limitToPropertyNames = [], prependSlash = false) {
    // Filter entries based on specificItem if provided
    const entries = Object.entries(declaration.properties || {});
    const filteredEntries = (limitToPropertyNames || []).length > 0
      ? entries.filter(([k,]) => limitToPropertyNames.includes(k))
      : entries;

    return filteredEntries.map(([k, v]) => {
      debug("getProperties, entries, (k,v):", k, v);

      const format = getFormatFunction(v);
      return [
        // Add leading slash only if we're filtering for a specific item
        prependSlash ? k.replace(/^(?!\/)/, "/") : k,
        [
          ["Value", wrapValue(v, definition[k])],
          ["Text", ["s", format(definition[k])]],
        ],
      ];
    });
  }

  const iface = {
    GetItems: function() {
      return getProperties(null, true);
    },
    GetValue: function() {
      return Object.entries(declaration.properties || {}).map(([k, v]) => {
        debug("GetValue, definition[k] and v:", definition[k], v);
        return [k.replace(/^(?!\/)/, ""), wrapValue(v, definition[k])];
      });
    },
    SetValues: function(values /* msg */) {
      debug(`SetValues called with values:`, values);
      for (const [k, value] of values) {
        if (!declaration.properties || !declaration.properties[k]) {
          throw new Error(`Property ${k} not found in properties.`);
        }
        if ((declaration.properties[k] || {}).readonly) {
          return -1;
        }
        definition[k] = validateNewValue(k, declaration.properties[k], unwrapValue(value));
      }

      debug(`SetValues updated definition:`, definition);
      // TODO: we must include changed values only.
      iface.emit("ItemsChanged", getProperties(Object.keys(values), true));
      return 0;
    },
    emit: function(name, args) {
      debug("emit called, name:", name, "args:", args);
      if (emitCallback) {
        emitCallback(name, args);
      }
    },
  };

  function setValuesLocally(values) {

    debug(`setValuesLocally called with values:`, values);

    if (Object.keys(values).length === 0) {
      throw new Error("No values provided to setValuesLocally.");
    }

    const sanitizedValues = {};
    for (const [key, value] of Object.entries(values)) {
      const cleanKey = key.startsWith('/') ? key.substring(1) : key;
      sanitizedValues[cleanKey] = value;
    }

    // first, check if any of the values are readonly, and if so, throw an error
    for (const k of Object.keys(sanitizedValues)) {
      if (!declaration.properties || !declaration.properties[k]) {
        throw new Error(`Property ${k} not found in properties.`);
      }
      if ((declaration.properties[k] || {}).readonly) {
        throw new Error(`Property ${k} is readonly and cannot be set.`);
      }
    }

    for (const k of Object.keys(sanitizedValues)) {
      definition[k] = validateNewValue(k, declaration.properties[k], sanitizedValues[k]);
    }
    debug(`setValuesLocally updated definition:`, definition);
    iface.emit("ItemsChanged", getProperties(Object.keys(sanitizedValues), true));
  }

  const ifaceDesc = {
    name: "com.victronenergy.BusItem",
    methods: {
      GetItems: ["", "a{sa{sv}}", [], ["items"]],
      GetValue: ["", "a{sv}", [], ["value"]],
      SetValues: ["a{sv}", "i", [], []],
    },
    signals: {
      ItemsChanged: ["a{sa{sv}}", "", [], []],
    },
  };

  bus.exportInterface(iface, "/", ifaceDesc);

  let emitS2Signal = undefined;

  if (declaration.__enableS2) {
    console.warn("S2 support is experimental");

    declaration.__s2state = { connectedCemId: null, lastSeen: 0, keepAliveInterval: 0 };

    if (!declaration.__s2Handlers || !declaration.__s2Handlers.Connect || typeof declaration.__s2Handlers.Connect !== 'function') {
      throw new Error(
        "S2 support enabled, but no __s2Handlers.Connect function provided in declaration",
      );
    }
    if (!declaration.__s2Handlers.Disconnect || typeof declaration.__s2Handlers.Disconnect !== 'function') {
      throw new Error(
        "S2 support enabled, but no __s2Handlers.Disconnect function provided in declaration",
      );
    }
    if (!declaration.__s2Handlers.Message || typeof declaration.__s2Handlers.Message !== 'function') {
      throw new Error(
        "S2 support enabled, but no __s2Handlers.Message function provided in declaration",
      );
    }
    if (!declaration.__s2Handlers.KeepAlive || typeof declaration.__s2Handlers.KeepAlive !== 'function') {
      throw new Error(
        "S2 support enabled, but no __s2Handlers.KeepAlive function provided in declaration",
      );
    }

    function setKeepAliveTimer(state) {
      if (state.keepAliveTimer) {
        clearTimeout(state.keepAliveTimer);
      }
      state.keepAliveTimer = setTimeout(() => {
        console.warn('S2 KeepAlive timeout reached for CEM ID', state.connectedCemId, ', disconnecting.');
        emitS2Signal('Disconnect', [state.connectedCemId, 'KeepAlive missed']);
        state.connectedCemId = null;
        state.keepAliveTimeout = 0;
        state.lastSeen = 0;
      }, state.keepAliveTimeout * 1.2 * 1000); // 20% grace period
    }

    const s2Iface = {
      Discover: function() {
        debugS2(
          `S2 "Discover" called, s2state:`, declaration.__s2state
        )
        return true;
      },
      Connect: function(cemId, keepAliveInterval) {

        debugS2(
          `S2 "Connect" called with cemId: ${cemId}, keepAliveInterval: ${keepAliveInterval}, s2state:`, declaration.__s2state
        );

        if (typeof cemId !== 'string' || cemId.length === 0) {
          throw new Error('Invalid cemId provided to S2 Connect');
        }

        if (typeof keepAliveInterval !== 'number' || keepAliveInterval <= 0) {
          throw new Error('Invalid keepAliveInterval provided to S2 Connect');
        }

        let returnValue = true;
        const state = declaration.__s2state;

        function now() {
          return new Date().getTime();
        }

        if (state.connectedCemId === null) {
          // first connection
          state.connectedCemId = cemId
          state.keepAliveTimeout = keepAliveInterval
          state.lastSeen = now()
          setKeepAliveTimer(state);
          debugS2('CEM ID', cemId, 'connected.')
          declaration.__s2Handlers.Connect(cemId, keepAliveInterval);
        } else if (state.connectedCemId === cemId) {
          // it's a reconnect, accept
          state.keepAliveTimeout = keepAliveInterval
          state.lastSeen = now()
          setKeepAliveTimer(state);
          debugS2('CEM ID', cemId, 're-connected.')
        } else {
          console.warn('CEM ID', cemId, 'is trying to connect, but CEM ID', state.connectedCemId, 'is already connected. Rejecting.')
          returnValue = false;
        }

        return returnValue;
      },
      Disconnect: function(cemId) {
        // TODO: when called without cemId via dbus-send, we don't fail, but get an object instead of a cemId. We should handle that case.
        // if we are not connected, ignore. If we are connected with a different cemId, ignore. If we are connected with the same cemId, disconnect, i.e. reset internal state, and call __s2Handlers.Disconnect.
        const state = declaration.__s2state;
        if (state.connectedCemId === cemId) {
          debugS2(`S2 Disconnect called with matching cemId ${cemId}, disconnecting.`);
          state.connectedCemId = null;
          state.lastSeen = 0;
          state.keepAliveTimeout = 0;
          clearInterval(state.keepAliveTimer);
          declaration.__s2Handlers.Disconnect(cemId);
        } else {
          console.warn(
            `S2 Disconnect called with cemId ${cemId}, but connectedCemId is ${state.connectedCemId}, ignoring.`,
          );
        }
      },
      Message: function(cemId, message) {
        debugS2(
          `S2 "Message" called with cemId: ${cemId}, message: ${message}`,
        );
        // only forward to the flow, if cemID matches connectedCemId
        // If cemID does not match, reply with a Disconnect signal.
        if (declaration.__s2state.connectedCemId === cemId) {
          declaration.__s2Handlers.Message(cemId, message);
        } else {
          console.warn(
            `S2 Message called with cemId ${cemId}, but connectedCemId is ${declaration.__s2state.connectedCemId}, ignoring and sending Disconnect signal back.`,
          );
          emitS2Signal('Disconnect', [cemId, 'Not connected']);
        }
      },
      KeepAlive: function(cemId) {
        debugS2(
          `S2 "KeepAlive" called with cemId: ${cemId}, s2state:`, declaration.__s2state
        );
        if (declaration.__s2state.connectedCemId !== cemId) {
          console.warn(
            `S2 KeepAlive called with cemId ${cemId}, but connectedCemId is ${declaration.__s2state.connectedCemId}, ignoring.`,
          );
          emitS2Signal('Disconnect', [cemId, 'Not connected']);
          return false;
        }
        // update lastSeen and reset timer
        declaration.__s2state.lastSeen = new Date().getTime();
        setKeepAliveTimer(declaration.__s2state);
        declaration.__s2Handlers.KeepAlive(cemId);
        return true;
      },
      emit: function(name, args) {
        debugS2("S2 emit called, name:", name, "args:", args);
        if (emitCallback) {
          emitCallback(name, args);
        }
      },
    };

    bus.exportInterface(
      s2Iface,
      "/S2/0/Rm",
      {
        name: "com.victronenergy.S2",
        methods: {
          Discover: ["", "b", [], ["success"]],
          Connect: ["si", "b", [], ["success"]],
          Disconnect: ["s", "", [], []],
          Message: ["ss", "", [], []],
          KeepAlive: ["s", "b", [], ["success"]],
        },
        signals: {
          Message: ["ss", "", [], []],
          Disconnect: ["ss", "", [], []],
        }
      }
    );
    delete declaration.__enableS2;

    emitS2Signal = function(name, args) {

      debugS2("emitS2Signal called, name:", name, "args:", args);

      const s2SignalNames = ['Message', 'Disconnect'];

      if (!s2SignalNames.includes(name)) {
        throw new Error(`Unsupported S2 signal name: ${name}, supported names: ${s2SignalNames.join(", ")}`);
      }

      const { connectedCemId } = declaration.__s2state;
      if (!connectedCemId) {
        console.warn(
          `emitS2Signal called for signal ${name}, but no CEM is connected, ignoring.`,
        );
        return;
      }
      const actualArgs = args.length > 1 ? args : [connectedCemId, args[0]];
      s2Iface.emit(name, ...actualArgs);

    }

  }

  // support GetValue, SetValue, GetMin, and GetMax for each property
  for (const [k] of Object.entries(declaration.properties || {})) {
    bus.exportInterface(
      {
        GetValue: function(/* value, msg */) {
          const v = (declaration.properties || {})[k];
          debug("GetValue, definition[k] and v:", definition[k], v);
          return wrapValue(v, definition[k]);
        },
        GetText: function() {
          const v = (declaration.properties || {})[k];
          const format = getFormatFunction(v);
          return format(definition[k]);
        },
        SetValue: function(value /* msg */) {
          if ((declaration.properties[k] || {}).readonly) {
            return -1;
          }
          try {
            definition[k] = validateNewValue(k, declaration.properties[k], unwrapValue(value));
            iface.emit("ItemsChanged", getProperties([k], true));
            return 0;
          } catch (e) {
            console.error(e);
            return -1;
          }
        },
        GetMin: function() {
          const v = (declaration.properties || {})[k];
          // Ensure we return a wrapped null if min is undefined
          const minValue = (v && v.min !== undefined) ? v.min : null;
          return wrapValue(v.type || getType(minValue), minValue);
        },
        GetMax: function() {
          const v = (declaration.properties || {})[k];
          // Ensure we return a wrapped null if max is undefined
          const maxValue = (v && v.max !== undefined) ? v.max : null;
          return wrapValue(v.type || getType(maxValue), maxValue);
        },
      },
      `/${k}`,
      {
        name: "com.victronenergy.BusItem",
        methods: {
          GetValue: ["", "v", [], ["value"]],
          GetText: ["", "s", [], ["text"]],
          SetValue: ["v", "i", [], []],
          GetMin: ["", "v", [], ["min"]],
          GetMax: ["", "v", [], ["max"]],
        },
      },
    );
  }

  return {
    emitItemsChanged: () => iface.emit("ItemsChanged", getProperties()),
    emitS2Signal,
    setValuesLocally,
    addSettings: (settings) => addSettings(bus, settings),
    removeSettings: (settings) => removeSettings(bus, settings),
    setValue: ({ path, interface_, destination, value, type }) =>
      setValue(bus, { path, interface_, destination, value, type }),
    getValue: ({ path, interface_, destination }) =>
      getValue(bus, { path, interface_, destination }),
    getMin: ({ path, interface_, destination }) =>
      getMin(bus, { path, interface_, destination }),
    getMax: ({ path, interface_, destination }) =>
      getMax(bus, { path, interface_, destination }),
    warnings,
  };
}

module.exports = {
  addVictronInterfaces,
  addSettings,
  removeSettings,
  getValue,
  setValue,
  getMin,
  getMax,
  // we export private functions for unit-testing
  __private__: {
    validateNewValue,
    wrapValue,
    unwrapValue,
    getType
  }
};
