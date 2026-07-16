// =================== AI CHATBOT ENGINE ===================
(function(){
'use strict';
let _aiKey=null,_pending=null,_chatHistory=[];
const $=id=>document.getElementById(id);

// Lấy các biến từ index.html một cách linh động
function getAiGlobals() {
  return window._ai || {};
}

function norm(s){
  return(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[đĐ]/g,c=>c<'e'?'D':'d').toLowerCase();
}
function fuzz(a,b){
  const wa=norm(a).split(/\W+/).filter(Boolean),wb=norm(b).split(/\W+/).filter(Boolean);
  if(!wa.length||!wb.length)return 0;
  const hit=wa.filter(w=>wb.some(x=>x.includes(w)||w.includes(x)));
  return hit.length/Math.max(wa.length,wb.length);
}
function addMsg(role,html){
  const c=$('ai-msgs'),d=document.createElement('div');
  d.className='aim '+role;
  d.innerHTML='<div class="aib">'+html+'</div>';
  c.appendChild(d);c.scrollTop=c.scrollHeight;
}
function showTyping(){
  const c=$('ai-msgs'),d=document.createElement('div');
  d.id='ai-ty';d.className='aim bot';
  d.innerHTML='<div class="aib"><span class="ai-dot"></span><span class="ai-dot"></span><span class="ai-dot"></span></div>';
  c.appendChild(d);c.scrollTop=c.scrollHeight;
}
function hideTyping(){const t=$('ai-ty');if(t)t.remove();}

// ── API Key ──
async function loadAIKey(){
  const { db, ref, get, child } = getAiGlobals();
  try{
    const s=await get(child(ref(db),'config/aiApiKey'));
    if(s.exists()){_aiKey=s.val();$('ai-key-inp').placeholder='✓ Key đã được cấu hình';}
  }catch(e){}
}
window.aiSaveKey=async function(){
  const { db, ref, update, getIS_ADMIN, showToast } = getAiGlobals();
  const k=$('ai-key-inp').value.trim();
  if(!k||k.length<10){showToast('Nhập key hợp lệ!','warning');return;}
  if(!getIS_ADMIN()){showToast('Chỉ Admin lưu được key!','error');return;}
  try{
    await update(ref(db),{'config/aiApiKey':k});
    _aiKey=k;
    $('ai-key-inp').value='';
    $('ai-key-inp').placeholder='✓ Đã lưu key mới!';
    showToast('Đã lưu API key lên Firebase!','success');
    $('ai-key-row').classList.remove('show');
  }catch(e){showToast('Lỗi lưu key!','error');}
};

// ── Toggle UI ──
window.toggleAIPanel=function(){
  const { getIS_ADMIN } = getAiGlobals();
  const p=$('ai-panel');
  p.classList.toggle('open');

  if(p.classList.contains('open')&&$('ai-msgs').children.length===0){
    addMsg('bot','👋 <strong>Xin chào!</strong> Dán báo cáo công tác vào đây.<br><br>'
      +'📌 Định dạng:<br><code>* Kết quả công tác 14/7:<br>'
      +'- Xác minh CT10: 1/1 TH: Hoàn thành.<br>'
      +'- Kích hoạt định danh điện tử mức 2: 08<br><br>'
      +'* Chương trình công tác 15/7:<br>'
      +'- Kích hoạt định danh mức 2:<br>'
      +'- Xác minh CT10: 02 TH.</code><br><br>'
      +'🔑 Nhấn ⚙️ để nhập API key DeepSeek.');
    loadAIKey();
    _chatHistory = []; // Reset history khi mở lại phiên mới
  }
};
window.toggleAIKey=function(){$('ai-key-row').classList.toggle('show');};

// ── Call DeepSeek ──
async function callDeepSeek(text){
  const { getTodayYMD } = getAiGlobals();
  if(!_aiKey)throw new Error('Chưa có API key. Nhấn ⚙️ để nhập!');
  const sys='Bạn là trợ lý AI thông minh chuyên phân tích báo cáo công tác PCCC tiếng Việt. Hôm nay: '+getTodayYMD()+'.\n\n'
    +'## NĂNG LỰC TƯ DUY VÀ SUY LUẬN:\n'
    +'- Nếu văn bản KHÔNG có tiêu đề rõ ràng "Kết quả" hay "Chương trình", hãy SUY LUẬN ngữ cảnh: nội dung đã xảy ra = results, nội dung chưa xảy ra/dự kiến = plans.\n'
    +'- Nếu ngày không được nêu rõ, suy luận: "hôm nay"/"sáng nay"/"chiều nay" = ngày hiện tại, "ngày mai"/"tuần tới" = ngày phù hợp.\n'
    +'- Nếu số lượng không rõ (vd: "xong rồi", "đã làm", "hoàn thành"), suy luận status="done", quantity=null.\n'
    +'- Nếu nội dung là câu hỏi hoặc yêu cầu sửa đổi (không phải báo cáo), hãy trả về {"results":[], "plans":[], "message": "<phản hồi bằng tiếng Việt>"}\n'
    +'- Nếu người dùng yêu cầu đổi/sửa tên nhiệm vụ (vd: "nhiệm vụ A sửa thành B"), hãy lấy tên mới (B) làm "taskName". Nếu có yêu cầu sửa đổi, BẮT BUỘC TRẢ VỀ TOÀN BỘ JSON TỪ ĐẦU đã cập nhật.\n\n'
    +'## QUY TẮC BẮT BUỘC:\n'
    +'- Nếu có lệnh giao việc chung (vd: "giao cho [Tên]", "[Tên] phụ trách"), BẮT BUỘC điền vào "globalAssignee".\n'
    +'- Nếu status không rõ: có chữ "chưa", "không", "bỏ sót" = not_done; có chữ "một phần", "đang", "còn" = partial; còn lại = done.\n'
    +'- Trả về ĐÚNG CẤU TRÚC JSON (không giải thích thêm, không markdown ngoài JSON):\n'
    +'{"globalAssignee":"Tên cán bộ nếu có","results":[{"date":"YYYY-MM-DD","taskName":"Tên cv","quantity":null,"unit":"lượt","status":"done","assignee":null}],"plans":[{"date":"YYYY-MM-DD","taskName":"Tên cv","quantity":null,"unit":"lượt","assignee":null}],"message":null}';
  
  if(_chatHistory.length === 0){
    _chatHistory.push({role:'system',content:sys});
  }
  _chatHistory.push({role:'user',content:text});
  
  const payload={
    model:'deepseek-v4-flash',temperature:0.1,
    messages: _chatHistory
  };
  const r=await fetch('https://api.deepseek.com/chat/completions',{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+_aiKey},
    body:JSON.stringify(payload)
  });
  if(!r.ok){
    const e=await r.json().catch(()=>({}));
    throw new Error(e.error?.message||'API lỗi '+r.status);
  }
  const d=await r.json();
  const msg = d.choices?.[0]?.message || {};
  // Các model thinking có thể trả kết quả vào reasoning_content nếu chưa kịp ra final content
  const content = msg.content || msg.reasoning_content;
  if(!content) throw new Error('AI không phản hồi (có thể do lỗi token hoặc server quá tải).');
  
  let jsonStr = content;
  const match = content.match(/```(?:json)?\n?([\s\S]*?)```/);
  if(match) jsonStr = match[1];
  
  try {
    const parsed = JSON.parse(jsonStr.trim());
    _chatHistory.push({role:'assistant',content:jsonStr.trim()}); // Lưu vào history dạng JSON chuẩn
    return parsed;
  } catch(err) {
    // Thử parse một phần nếu AI trả về text kèm JSON
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if(jsonMatch){
      try{
        const parsed2 = JSON.parse(jsonMatch[0]);
        _chatHistory.push({role:'assistant',content:jsonMatch[0]});
        return parsed2;
      }catch(e2){}
    }
    _chatHistory.pop(); // Xóa tin nhắn user vừa rồi nếu AI lỗi
    console.error('Lỗi parse JSON:', jsonStr);
    throw new Error('AI trả về sai định dạng. Vui lòng thử lại!');
  }
}

// ── Fuzzy match helpers ──
function findInTasks(name,obj){
  let best=null,sc=0;
  for(const[id,t]of Object.entries(obj||{})){
    const s=fuzz(name,t.tenCongViec||'');
    if(s>sc&&s>=0.2){best={id,t};sc=s;}
  }
  if(best) console.log('[AI] findInTasks "'+name+'" → "'+best.t.tenCongViec+'" score='+sc.toFixed(2));
  else console.warn('[AI] findInTasks "'+name+'" → KHÔNG KHỚP (max score='+sc.toFixed(2)+')');
  return best;
}
function findInMaster(name){
  const { getMasterTasks } = getAiGlobals();
  let best=null,sc=0;
  for(const[id,t]of Object.entries(getMasterTasks()||{})){
    const s=fuzz(name,t.tenNhiemVu||'');
    if(s>sc&&s>=0.2){best={id,t};sc=s;}
  }
  if(best) console.log('[AI] findInMaster "'+name+'" → "'+best.t.tenNhiemVu+'" score='+sc.toFixed(2));
  else console.warn('[AI] findInMaster "'+name+'" → Không khớp, sẽ tạo mới');
  return best;
}
function findStaff(name){
  if(!name) return null;
  const { getStaffs } = getAiGlobals();
  const staffs = getStaffs ? getStaffs() : [];
  let best=null,sc=0;
  for(const s of staffs){
    const scMatch = fuzz(name, s.ten);
    if(scMatch > sc && scMatch > 0.3){ best = s.ten; sc = scMatch; }
  }
  return best || name; // Trả về tên gần giống nhất, nếu không tự giữ nguyên tên AI tìm
}

// ── Build action list ──
async function buildActions(parsed){
  const { db, ref, get, child, getIS_ADMIN, getDeviceUser, getTodayYMD } = getAiGlobals();
  const acts=[];
  const sMap={done:'Hoàn thành',partial:'Hoàn thành một phần',not_done:'Chưa thực hiện'};
  
  // Xác định người phụ trách mặc định
  const isAdmin = typeof getIS_ADMIN === 'function' ? getIS_ADMIN() : getIS_ADMIN;
  const deviceUser = typeof getDeviceUser === 'function' ? getDeviceUser() : getDeviceUser;
  const defaultNguoi = isAdmin ? 'Admin' : (deviceUser || '');
  const fallbackDate = typeof getTodayYMD === 'function' ? getTodayYMD() : new Date().toISOString().slice(0,10);

  console.log('[AI] buildActions - isAdmin:',isAdmin,' deviceUser:',deviceUser,' fallbackDate:',fallbackDate);
  console.log('[AI] parsed.results:',parsed.results?.length,'parsed.plans:',parsed.plans?.length);

  for(const r of(parsed.results||[])){
    if(!r.date) r.date = fallbackDate;
    let dt={};
    try{
      const s=await get(child(ref(db),'keHoachNgay/'+r.date));
      if(s.exists()){dt=s.val();console.log('[AI] Firebase keHoachNgay/'+r.date+': tìm thấy',Object.keys(dt).length,'task');}
      else{console.warn('[AI] Firebase keHoachNgay/'+r.date+': KHÔNG CÓ DỮ LIỆU');}
    }catch(e){console.error('[AI] Lỗi đọc Firebase:',e);}
    const m=findInTasks(r.taskName,dt);
    
    // Gán cán bộ
    const finalNguoi = isAdmin ? (findStaff(r.assignee) || findStaff(parsed.globalAssignee) || 'Admin') : (deviceUser || '');
    
    if(m){
      acts.push({type:'EVAL',date:r.date,id:m.id,taskName:m.t.tenCongViec,
        chiTieu:m.t.chiTieu||1,dvt:m.t.dvt||'lượt',
        qty:r.quantity,unit:r.unit,status:r.status,label:sMap[r.status]||'Hoàn thành',nguoi:finalNguoi});
    }else{
      const mm=findInMaster(r.taskName);
      acts.push({type:'PHAT_SINH',date:r.date,
        taskName: mm ? mm.t.tenNhiemVu : r.taskName,
        qty:r.quantity ?? 1,unit:r.unit||'lượt',
        loai:mm?.t?.nhomNhiemVu||'Công việc khác',
        nguoi:finalNguoi,label:sMap[r.status]||'Hoàn thành',
        isNewMaster: !mm});
    }
  }
  for(const p of(parsed.plans||[])){
    if(!p.date) p.date = fallbackDate;
    const m=findInMaster(p.taskName);
    const finalNguoi = getIS_ADMIN() ? (findStaff(p.assignee) || findStaff(parsed.globalAssignee) || 'Admin') : (getDeviceUser() || '');
    acts.push({type:'PLAN',date:p.date,
      taskName: m ? m.t.tenNhiemVu : p.taskName,
      qty:p.quantity!=null?p.quantity:(m?.t?.chiTieuMacDinh??1),
      unit:p.unit||m?.t?.donViTinh||'lượt',
      loai:m?.t?.nhomNhiemVu||'Công việc khác',
      priority:m?.t?.uutienMacDinh||'Trung bình',
      isNewMaster: !m,
      nguoi:finalNguoi});
  }
  return acts;
}

// ── Render preview panel ──
function renderPreview(acts){
  const { formatDMY } = getAiGlobals();
  const pv=$('ai-preview');
  if(!acts.length){pv.style.display='none';return;}
  let h='<div style="font-size:.8rem;font-weight:700;color:#475569;margin-bottom:7px">📋 Xem trước '+acts.length+' thao tác:</div>';
  for(const a of acts){
    let icon,tc,tt,det;
    if(a.type==='EVAL'){
      icon=a.status==='done'?'✅':a.status==='partial'?'⏳':'❌';
      tc='r';tt='Cập nhật KQ';
      det=a.label+(a.qty!=null?', TT: '+a.qty+' '+(a.unit||a.dvt):'');
    }else if(a.type==='PHAT_SINH'){
      icon='⚡';tc='ps';
      tt=a.isNewMaster ? 'Đề xuất mới (PS)' : 'Phát sinh';
      det=a.label+' · '+a.qty+' '+a.unit+(a.nguoi?' · '+a.nguoi:'');
    }else{
      icon='📅';tc='pl';
      tt=a.isNewMaster ? 'Đề xuất mới' : 'Kế hoạch';
      det='CT: '+a.qty+' '+a.unit+(a.nguoi?' · '+a.nguoi:'');
    }
    h+='<div class="ai-pv-item">'
      +'<span>'+icon+'</span>'
      +'<div style="flex:1">'
        +'<div><span class="ai-pv-tag '+tc+'">'+tt+'</span> '
        +'<strong>'+window.esc(a.taskName)+'</strong> '
        +'<span style="color:#64748b;font-size:.75rem">('+formatDMY(a.date)+')</span></div>'
        +'<div style="color:#64748b;font-size:.77rem;margin-top:2px">'+det+'</div>'
      +'</div></div>';
  }
  h+='<div class="ai-cf-btns">'
    +'<button class="ai-cf-yes" onclick="aiExecute()">✅ Xác nhận thực hiện</button>'
    +'<button class="ai-cf-no" onclick="aiCancel()">❌ Hủy</button>'
    +'</div>';
  pv.innerHTML=h;pv.style.display='block';
}

// ── Execute to Firebase ──
window.aiExecute=async function(){
  const { db, ref, get, child, update, getIS_ADMIN, getDeviceUser, showLoader, showToast, nvxnSyncDailyEntries, getTodayYMD } = getAiGlobals();
  if(!_pending)return;
  console.log('[AI] aiExecute - _pending:',JSON.stringify(_pending,null,2));
  $('ai-preview').style.display='none';
  showLoader(true);
  const updates={},now=Date.now();
  try{
    for(const a of _pending){
      if(a.type==='EVAL'){
        const pct=a.status==='done'?100
          :a.status==='partial'?(a.qty&&a.chiTieu?Math.min(99,Math.round(a.qty/a.chiTieu*100)):50)
          :0;
        updates['keHoachNgay/'+a.date+'/'+a.id+'/danhGia']={
          ketQua:a.label,tiLeHoanThanh:pct,soLuongThucTe:a.qty!=null?a.qty:pct,
          lyDoKhongDat:'',ghiChuThem:'(Chatbot AI)',
          nguyenNhanKhachQuan:false,nguyenNhanChuQuan:false,baiHocKinhNghiem:'',
          chuyenSangNgay:'',thoiDiemDanhGia:now,daChuyenTiep:false,
          lichSu:[{thoiGian:new Date().toLocaleString('vi-VN'),
            hanhDong:'Chatbot AI: '+a.label+' ('+pct+'%)'}],
          daDuyet:getIS_ADMIN()
        };
      }else if(a.type==='PHAT_SINH'){
        const nid='PS-'+a.date.replace(/-/g,'')+'-'+now.toString().slice(-6);
        updates['keHoachNgay/'+a.date+'/'+nid]={
          id:nid,tenCongViec:a.taskName,loaiCongViec:a.loai,
          chiTieu:a.qty,dvt:a.unit,
          nguoiPhuTrach:a.nguoi,
          nguoiPhoiHop:'',mucDoUuTien:'Trung bình',
          trangThai:'hoan_thanh',isPhatSinh:true,
          daDuyetNhiemVu:getIS_ADMIN(),targetDate:a.date,
          danhGia:{ketQua:a.label,tiLeHoanThanh:100,soLuongThucTe:a.qty,
            lyDoKhongDat:'',ghiChuThem:'(Chatbot AI)',
            nguyenNhanKhachQuan:false,nguyenNhanChuQuan:false,baiHocKinhNghiem:'',
            chuyenSangNgay:'',thoiDiemDanhGia:now,daChuyenTiep:false,
            lichSu:[{thoiGian:new Date().toLocaleString('vi-VN'),
              hanhDong:'Chatbot AI ghi nhận phát sinh'}],
            daDuyet:getIS_ADMIN()}
        };
      }else if(a.type==='PLAN'){
        const nid='CV-'+a.date.replace(/-/g,'')+'-'+now.toString(36)+'-'+Math.random().toString(36).slice(2,5);
        updates['keHoachNgay/'+a.date+'/'+nid]={
          id:nid,tenCongViec:a.taskName,loaiCongViec:a.loai,
          chiTieu:a.qty,dvt:a.unit,
          nguoiPhuTrach:a.nguoi,
          nguoiPhoiHop:'',diaDiem:'',ghiChu:'(Chatbot AI)',
          mucDoUuTien:a.priority,trangThai:'dang_thuc_hien',
          daDuyetKeHoach:getIS_ADMIN(),targetDate:a.date,isPhatSinh:false
        };
      }
    }
    console.log('[AI] updates object keys:',Object.keys(updates));
    console.log('[AI] updates chi tiết:',JSON.stringify(updates,null,2));
    await update(ref(db),updates);
    const ev=_pending.filter(a=>a.type==='EVAL').length;
    const ps=_pending.filter(a=>a.type==='PHAT_SINH').length;
    const pl=_pending.filter(a=>a.type==='PLAN').length;
    addMsg('bot','✅ <strong>Hoàn thành!</strong><br>'
      +(ev?'• Cập nhật <strong>'+ev+'</strong> kết quả<br>':'')
      +(ps?'• Thêm <strong>'+ps+'</strong> công việc phát sinh<br>':'')
      +(pl?'• Thêm <strong>'+pl+'</strong> kế hoạch ngày mới<br>':'')
      +'📌 Vào tab <strong>Đánh giá</strong> / <strong>Đăng ký</strong> để kiểm tra.');
    _pending=null;
    _chatHistory=[]; // Xóa phiên khi đã thành công
    showToast('Chatbot AI đã cập nhật xong!','success');
    try{await nvxnSyncDailyEntries();}catch(e){}
    // Kiểm tra công việc chưa đánh giá sau khi lưu
    setTimeout(()=>checkUnevaluatedTasks(db,ref,get,child,getTodayYMD),1200);
  }catch(e){addMsg('bot','❌ Lỗi: '+window.esc(e.message));}
  showLoader(false);
};

window.aiCancel=function(){
  $('ai-preview').style.display='none';
  _pending=null;
  _chatHistory=[]; // Hủy là bắt đầu lại từ đầu
  addMsg('bot','Đã hủy. Bạn có thể dán lại báo cáo mới.');
};

// ── Kiểm tra công việc chưa đánh giá ──
async function checkUnevaluatedTasks(db,ref,get,child,getTodayYMD){
  try{
    const today = getTodayYMD();
    const snap = await get(child(ref(db),'keHoachNgay/'+today));
    if(!snap.exists()) return;
    const data = snap.val();
    const unevaluated = [];
    for(const [id,task] of Object.entries(data||{})){
      const ten = task.tenCongViec || '';
      if(!ten) continue;
      // Công việc chưa có đánh giá hoặc đánh giá trống
      const dg = task.danhGia;
      const chuaDanhGia = !dg || !dg.ketQua || dg.ketQua === '';
      if(chuaDanhGia){
        unevaluated.push(ten);
      }
    }
    if(unevaluated.length === 0) return;
    // Hiển thị cảnh báo
    let warn = '⚠️ <strong>Còn '+unevaluated.length+' công việc hôm nay chưa được đánh giá kết quả:</strong><br><ul style="margin:6px 0 8px 0;padding-left:18px">';
    unevaluated.slice(0,5).forEach(t=>{ warn += '<li style="margin:2px 0">'+window.esc(t)+'</li>'; });
    if(unevaluated.length > 5) warn += '<li style="color:#94a3b8">...và '+(unevaluated.length-5)+' công việc khác</li>';
    warn += '</ul>';
    warn += '💡 Bạn có muốn tôi hỗ trợ đánh giá các công việc này không?<br>';
    warn += '<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">';
    warn += '<button onclick="aiPromptEvaluate()" style="background:#f59e0b;color:#fff;border:none;border-radius:6px;padding:6px 14px;cursor:pointer;font-size:.82rem;font-weight:600">📝 Đánh giá ngay</button>';
    warn += '<button onclick="aiDismissWarn(this)" style="background:#e2e8f0;color:#475569;border:none;border-radius:6px;padding:6px 14px;cursor:pointer;font-size:.82rem">Bỏ qua</button>';
    warn += '</div>';
    addMsg('bot', warn);
  }catch(e){ console.warn('checkUnevaluatedTasks lỗi:', e); }
}

// Gợi ý người dùng điền kết quả đánh giá
window.aiPromptEvaluate = function(){
  const inp = $('ai-inp');
  if(inp){
    inp.value = 'Các công việc hôm nay: [Hãy liệt kê kết quả từng việc, ví dụ]\n- Kiểm tra CT10: Hoàn thành\n- Kích hoạt định danh mức 2: 5 lượt';
    inp.focus();
    inp.select();
    addMsg('bot','📋 Hãy điền kết quả vào ô bên dưới theo mẫu trên rồi nhấn <strong>Gửi</strong>.');
  }
};

window.aiDismissWarn = function(btn){
  const msgEl = btn?.closest('.aib');
  if(msgEl) msgEl.innerHTML += '<br><span style="color:#94a3b8;font-size:.78rem">✓ Đã bỏ qua cảnh báo.</span>';
  btn.closest('div').style.display='none';
};

// ── Main send handler ──
window.aiSend=async function(){
  const inp=$('ai-inp'),text=inp.value.trim();
  if(!text)return;
  addMsg('user',window.esc(text).replace(/\n/g,'<br>'));
  inp.value='';$('ai-send').disabled=true;
  showTyping();
  try{
    const parsed=await callDeepSeek(text);
    hideTyping();
    const rc=parsed.results?.length||0,pc=parsed.plans?.length||0;
    // Nếu AI trả về message (câu hỏi, hội thoại, không phải báo cáo)
    if(parsed.message){
      addMsg('bot','🤖 '+window.esc(parsed.message));
      $('ai-send').disabled=false;return;
    }
    if(!rc&&!pc){
      addMsg('bot','ℹ️ Không tìm thấy kết quả/kế hoạch trong văn bản.<br>💡 Gợi ý: Đảm bảo văn bản có mô tả công việc và kết quả rõ ràng, hoặc thêm ghi chú ngày tháng.');
      $('ai-send').disabled=false;return;
    }
    addMsg('bot','🧠 <strong>Đã phân tích:</strong> <strong>'+rc+'</strong> kết quả, <strong>'+pc+'</strong> kế hoạch. Đang đối chiếu hệ thống...');
    showTyping();
    _pending=await buildActions(parsed);
    hideTyping();
    renderPreview(_pending);
    addMsg('bot',_pending.length
      ?'Xem bên dưới và nhấn <strong>Xác nhận thực hiện</strong> để lưu vào hệ thống.'
      :'Không có thay đổi cần thực hiện.');
  }catch(e){
    hideTyping();
    addMsg('bot','❌ '+window.esc(e.message));
  }
  $('ai-send').disabled=false;
};

// Enter (không Shift) để gửi
document.addEventListener('DOMContentLoaded',function(){
  var i=$('ai-inp');
  if(i)i.addEventListener('keydown',function(e){
    if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();aiSend();}
  });
});
})();
// =================== END AI CHATBOT ENGINE ===================
