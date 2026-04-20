/* eslint-env node */
const { addVictronInterfaces } = require("../index");

describe("victron-dbus-virtual, setValue with onPropertiesChanged tests", () => {
  it("works for the happy case", async () => {
    const declaration = { name: "foo", properties: { StringProp: "s", DerivedProp: "s" } };
    const definition = { StringProp: "hello", DerivedProp: "derived" };
    const bus = {
      exportInterface: () => { },
      invoke: function(args, cb) {
        process.nextTick(() => cb(null, args));
      },
    };
    function onPropertiesChanged({ changes, instance }) {
      changes.DerivedProp = instance.StringProp + " world";
      return changes;
    }
    const { setValue } = addVictronInterfaces(
      bus,
      declaration,
      definition,
      false,
      onPropertiesChanged
    );

    const result = await setValue({
      path: "/StringProp",
      value: "forty-two",
      destination: "foo",
      interface_: "foo",
    });
    expect(result.member).toBe("SetValue");
    expect(result.body).toStrictEqual([["s", "forty-two"]]);
    expect(result.path).toBe("/StringProp");
    expect(result.interface).toBe("foo");
    expect(result.destination).toBe("foo");

    // NOTE: calling setValue() does *not* change the definition, compare comment in ./setValueTest.js
    expect(definition.StringProp).toBe("hello");
    expect(definition.DerivedProp).toBe("derived");
  });
});

