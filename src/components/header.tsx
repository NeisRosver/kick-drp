import { getCurrentWindow } from "@tauri-apps/api/window";
import { LuMinus, LuSquare, LuX } from "react-icons/lu";


export function Header() {
    const appWindow = getCurrentWindow()

    return (
      <header className="flex h-8 items-center justify-between border-b border-white/10" data-tauri-drag-region>
        <div className="ml-3 flex grow gap-3 py-2" data-tauri-drag-region>
            <img src="icon.png" className="size-6" />
            <span className="font-semibold">Kick DRP</span>
        </div>
        <div className="flex h-8 items-center">
            <button
                type="button"
                onClick={() => appWindow.minimize()}
                className="flex h-8 w-11 items-center justify-center text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            >
                <LuMinus size={15} />
            </button>

            <button
                type="button"
                onClick={() => appWindow.toggleMaximize()}
                className="flex h-8 w-11 items-center justify-center text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            >
                <LuSquare size={13} />
            </button>

            <button
                type="button"
                onClick={() => appWindow.close()}
                className="flex h-8 w-11 items-center justify-center text-white/60 transition-colors hover:bg-[#e81123] hover:text-white"
            >
                <LuX size={16} />
            </button>
        </div>
      </header>
    )
}