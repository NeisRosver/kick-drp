import { LuCircle } from "react-icons/lu"

export function Footer() {
    return (
      <div className="border-white/10 border-t pr-2 h-6 flex items-center justify-end gap-2 text-sm text-[#53fc18]">
        <LuCircle size={10} fill="currentColor" />
        Connected
      </div>
    )
}