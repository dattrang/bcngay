import sys
sys.stdout.reconfigure(encoding='utf-8')

file_path = r"d:\Chuyên đề 2025\PCCC\Chương trình\index.html"

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

start_idx = 284699
end_idx = 286575 + len('\r\n                    }')

new_block = """showLoader(true);
                        try {
                            const newId = `PS-${dateStr.replace(/-/g, '')}-${Date.now().toString().slice(-6)}`;

                            // [AUTO-COMPLETE] Admin th\u00eam \u2192 t\u1ef1 \u0111\u00e1nh gi\u00e1 ho\u00e0n th\u00e0nh 100% ngay khi l\u01b0u
                            const autoComplete = DEVICE_USER === 'Admin';
                            const autoDanhGia = autoComplete ? {
                                tiLeHoanThanh: 100,
                                soLuongThucTe: chiTieu,
                                ketQua: 'Ho\u00e0n th\u00e0nh',
                                lyDoKhongDat: '',
                                thoiDiemDanhGia: Date.now(),
                                nguoiDanhGia: 'Admin',
                                tuDongChot: false
                            } : null;

                            const newTask = {
                                id: newId,
                                tenCongViec: ten,
                                loaiCongViec: nhom,
                                chiTieu: chiTieu,
                                dvt: dvt,
                                nguoiPhuTrach: nguoi,
                                nguoiPhoiHop: '',
                                mucDoUuTien: uutien,
                                trangThai: autoComplete ? 'hoan_thanh' : 'dang_thuc_hien',
                                isPhatSinh: true,
                                daDuyetNhiemVu: autoComplete,
                                danhGia: autoDanhGia
                            };

                            const updates = {};
                            updates[`keHoachNgay/${dateStr}/${newId}`] = newTask;
                            await update(ref(db), updates);

                            showToast(autoComplete
                                ? '\u2705 Ghi nh\u1eadn v\u00e0 x\u00e1c nh\u1eadn ho\u00e0n th\u00e0nh th\u00e0nh c\u00f4ng!'
                                : '\u0110\u00e3 g\u1eedi nhi\u1ec7m v\u1ee5 m\u1edbi! \u0110ang ch\u1edd Admin ph\u00ea duy\u1ec7t.');
                            closePhatSinhModal();
                            loadTasksForEval(); // Reload UI
                        } catch (e) {
                            console.error(e);
                            showToast('L\u1ed7i khi ghi nh\u1eadn c\u00f4ng vi\u1ec7c ph\u00e1t sinh', 'error');
                        }
                        showLoader(false);
                    }\r\n"""

new_content = content[:start_idx] + new_block + content[end_idx:]

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(new_content)

print("SUCCESS: File patched. New length:", len(new_content))
print("Chars changed:", len(new_content) - len(content))
