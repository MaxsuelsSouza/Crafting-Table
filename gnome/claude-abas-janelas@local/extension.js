// No Wayland só o próprio GNOME pode trazer a janela de outro programa para frente.
const { Gio } = imports.gi;
const Main = imports.ui.main;

const IFACE = `<node><interface name="org.claudeAbas.Janelas">
  <method name="Ativar">
    <arg type="u" direction="in" name="pid"/>
    <arg type="s" direction="in" name="titulo"/>
    <arg type="b" direction="out" name="ok"/>
  </method>
</interface></node>`;

class Extensao {
  enable() {
    this._dbus = Gio.DBusExportedObject.wrapJSObject(IFACE, this);
    this._dbus.export(Gio.DBus.session, '/org/claudeAbas/Janelas');
    this._nome = Gio.bus_own_name(Gio.BusType.SESSION, 'org.claudeAbas.Janelas', Gio.BusNameOwnerFlags.NONE, null, null, null);
  }

  disable() {
    this._dbus.unexport();
    Gio.bus_unown_name(this._nome);
  }

  // Pelo PID; se a janela não informar PID, pelo trecho do título.
  Ativar(pid, titulo) {
    const janelas = global.get_window_actors().map((a) => a.meta_window);
    const w = janelas.find((j) => pid && j.get_pid() === pid) || janelas.find((j) => titulo && (j.get_title() || '').includes(titulo));
    if (!w) return false;
    Main.activateWindow(w);
    return true;
  }
}

function init() {
  return new Extensao();
}
