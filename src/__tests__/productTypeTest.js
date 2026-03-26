/* eslint-env node */
const { addVictronInterfaces } = require("../index");

describe("victron-dbus-virtual, honor productType in declaration", () => {
  const noopBus = { exportInterface: () => { } };

  it("works when not available", () => {
    const declaration = { name: "one.two.meteo", properties: {} };
    const definition = {};
    const result = addVictronInterfaces(
      noopBus,
      declaration,
      definition,
      true /* addDefaults */,
    );
    expect(!!result).toBe(true);
    expect(definition.ProductId).toBe(49249); // meteo device, as per declaration.name
  });

  it("works when available", () => {
    const declaration = { name: "one.two.something-else", productType: 'meteo', properties: {} };
    const definition = {};
    const result = addVictronInterfaces(
      noopBus,
      declaration,
      definition,
      true /* addDefaults */,
    );
    expect(!!result).toBe(true);
    expect(definition.ProductId).toBe(49249); // meteo device, as per declaration.productType, which should take precedence over declaration.name
  });

});

