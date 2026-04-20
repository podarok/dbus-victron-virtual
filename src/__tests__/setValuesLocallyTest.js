/* eslint-env node */
const { addVictronInterfaces } = require("../index");

describe("victron-dbus-virtual, setValuesLocally", () => {
  it("works for the happy case", async () => {
    const declaration = { name: "foo", properties: { SomeProp: "s", OtherProp: "i" } };
    const definition = { SomeProp: "my text" };
    const bus = {
      exportInterface: jest.fn(),
    };

    const cb = jest.fn();

    const { setValuesLocally } = addVictronInterfaces(bus, declaration, definition, false, cb);

    setValuesLocally({
      SomeProp: "text changed",
    })

    expect(definition.SomeProp).toBe("text changed");

    // ensure ItemsChanged is emitted, and only 'SomeProp' is included, not 'OtherProp'
    expect(cb).toHaveBeenCalledWith("ItemsChanged", [["/SomeProp", [['Value', ['s', 'text changed']], ['Text', ['s', 'text changed']]]]]);

  })

  it("fails if no properties are given", async () => {
    const declaration = { name: "foo", properties: { SomeProp: "s" } };
    const definition = { SomeProp: "my text" };
    const bus = {
      exportInterface: jest.fn(),
    };

    const cb = jest.fn();

    const { setValuesLocally } = addVictronInterfaces(bus, declaration, definition, false, cb);

    expect(() => {
      setValuesLocally({});
    }).toThrow("No values provided to setValuesLocally");
  })

  it("fails if a property is not defined in the declaration", async () => {
    const declaration = { name: "foo", properties: { SomeProp: "s" } };
    const definition = { SomeProp: "my text" };
    const bus = {
      exportInterface: jest.fn(),
    };

    const cb = jest.fn();

    const { setValuesLocally } = addVictronInterfaces(bus, declaration, definition, false, cb);

    expect(() => {
      setValuesLocally({
        UndefinedProp: "text changed",
      });
    }).toThrow("Property UndefinedProp not found in properties");
  })

  it("fails if a property value does not validate", async () => {
    const declaration = { name: "foo", properties: { IntProp: "i" } };
    const definition = { IntProp: 42 };
    const bus = {
      exportInterface: jest.fn(),
    };

    const cb = jest.fn();

    const { setValuesLocally } = addVictronInterfaces(bus, declaration, definition, false, cb);

    expect(() => {
      setValuesLocally({
        IntProp: "x"
      });
    }).toThrow("value for IntProp is not a number");

  });

  it("trying to set readonly properties fails, without changing anything", () => {
    const declaration = { name: "foo", properties: { ReadOnlyProp: { type: "s", readonly: true }, WritableProp: "s" } };
    const definition = { ReadOnlyProp: "original", WritableProp: "original" };
    const bus = { exportInterface: jest.fn() };
    const cb = jest.fn();

    const { setValuesLocally } = addVictronInterfaces(bus, declaration, definition, false, cb);

    try {
      setValuesLocally({ ReadOnlyProp: "changed", WritableProp: "changed" });
      expect(true).toBe(false); // should not reach this line
    } catch (e) {
      expect(e.message.match("ReadOnlyProp is readonly")).toBeTruthy();
    }

    expect(definition.ReadOnlyProp).toBe("original");
    expect(definition.WritableProp).toBe("original");
  });

  describe("setValuesLocally with onPropertiesChanged", () => {
    it("calls onPropertiesChanged callback and updates the definition accordingly", () => {
      const declaration = { name: "foo", properties: { StringProp: "s", DerivedProp: "s" } };
      const definition = { StringProp: "(nothing yet)", DerivedProp: "derived" };
      const bus = {
        exportInterface: () => { },
      };
      const onPropertiesChanged = jest.fn(({ changes }) => {
        const result = { ...changes }
        if (changes.StringProp) {
          result.DerivedProp = changes.StringProp + " world";
        }
        return result;
      });

      const { setValuesLocally } = addVictronInterfaces(
        bus,
        declaration,
        definition,
        false,
        null,
        onPropertiesChanged
      );

      setValuesLocally({ StringProp: "hello" });

      expect(onPropertiesChanged).toHaveBeenCalledWith({
        changes: { StringProp: "hello" },
        instance: definition
      });

      expect(definition.StringProp).toBe("hello");
      expect(definition.DerivedProp).toBe("hello world");

    });
    it("fails if onPropertiesChanged returns invalid properties", () => {
      const declaration = { name: "foo", properties: { StringProp: "s", DerivedProp: "s" } };
      const definition = { StringProp: "(nothing yet)", DerivedProp: "derived" };
      const bus = {
        exportInterface: () => { },
      };
      const onPropertiesChanged = jest.fn(() => {
        return { NonExistentProp: "value" };
      });

      const { setValuesLocally } = addVictronInterfaces(
        bus,
        declaration,
        definition,
        false,
        null,
        onPropertiesChanged
      );

      expect(() => {
        setValuesLocally({ StringProp: "hello" });
      }).toThrow("Property NonExistentProp not found in properties");
    });
  });
});

describe("victron-dbus-virtual, SetValues", () => {

  it("works for the happy case", () => {
    const declaration = { name: "foo", properties: { SomeProp: { type: "s" }, OtherProp: { type: "i" } } };
    const definition = { SomeProp: "my text" };
    const bus = {
      exportInterface: jest.fn(),
    };

    addVictronInterfaces(bus, declaration, definition, false);

    const iface = bus.exportInterface.mock.calls[0][0];
    const result = iface.SetValues([
      ["SomeProp", [[{ type: "s" }], ["changed"]]]
    ]);
    expect(result).toBe(0);
    expect(definition.SomeProp).toBe("changed");
  });

  it("fails if the property is not defined in the declaration", () => {
    const declaration = { name: "foo", properties: { SomeProp: { type: "s" } } };
    const definition = { SomeProp: "my text" };
    const bus = {
      exportInterface: jest.fn(),
    };

    addVictronInterfaces(bus, declaration, definition, false);

    const iface = bus.exportInterface.mock.calls[0][0];
    try {
      iface.SetValues([
        ["UndefinedProp", [[{ type: "s" }], ["changed"]]]
      ]);
      expect(true).toBe(false); // should not reach this line
    } catch (e) {
      expect(e.message.match("Property UndefinedProp not found in properties")).toBeTruthy();
    }
    // TODO: our behavior might be wrong: Should we return -1 instead of throwing an error?
    // expect(result).toBe(-1);
    expect(definition.SomeProp).toBe("my text");
  });

  it("returns -1 and does not update when SetValues includes a readonly property", () => {
    const declaration = { name: "foo", properties: { ReadOnlyProp: { type: "s", readonly: true }, WritableProp: "s" } };
    const definition = { ReadOnlyProp: "original", WritableProp: "original" };
    const bus = { exportInterface: jest.fn() };

    addVictronInterfaces(bus, declaration, definition, false);

    const iface = bus.exportInterface.mock.calls[0][0];
    const result = iface.SetValues([["ReadOnlyProp", [[{ type: "s" }], ["changed"]]]]);
    expect(result).toBe(-1);
    expect(definition.ReadOnlyProp).toBe("original");
  });
})


