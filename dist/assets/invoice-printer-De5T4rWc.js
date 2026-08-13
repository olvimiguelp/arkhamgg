import{N,X as pn,Y as x,Z as vn,_ as A,$ as wn,g as e,a0 as fn}from"./index-C69zp4mv.js";const C={businessName:N.businessName,businessRnc:"",businessPhone:N.phones,businessAddress:N.address,businessEmail:N.email},h=38,w="=".repeat(h),m="-----------",gn=1.25,un=N.businessName.toUpperCase(),p=n=>Number((n*gn).toFixed(2)),_=`
  <div class="line">${m}</div>
  <div class="space"></div>
`,T=`
  @page { size: auto; margin: 0mm; }
  body { 
    font-family: Calibri, 'Segoe UI', Candara, Arial, sans-serif;
    font-size: ${p(16)}px;
    margin: 0;
    padding: 0;
    background-color: #fff;
    line-height: 1.5;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .ticket {
    width: 80mm;
    max-width: 80mm;
    margin: 0 auto;
    padding: 2mm 2mm 2mm 2mm;
    box-sizing: border-box;
    background: white;
  }
  .center { text-align: center; }
  .left { text-align: left; }
  .right { text-align: right; }
  .bold { font-weight: bold; }
  .flex-row {
    display: flex;
    justify-content: space-between;
    width: 100%;
    line-height: 1.3;
    margin-bottom: 0.5mm;
  }
  .line { 
    white-space: pre-wrap;
    font-size: ${p(16)}px;
    font-family: Calibri, 'Segoe UI', Candara, Arial, sans-serif;
    width: 100%;
    line-height: 1.3;
    margin-bottom: 0.5mm;
  }
  .header { 
      font-size: ${p(24)}px;
      font-weight: 900; 
      text-align: center; 
      margin: 0 0 1mm 0;
      padding: 0;
      line-height: 1.1;
      color: #000;
      text-transform: uppercase;
      width: 100%;
  }
  .subtitle {
      font-size: ${p(12)}px;
      font-weight: bold;
      text-align: center;
      margin-bottom: 2mm;
      color: #000;
      width: 100%;
  }
  .contact-info {
      font-size: ${p(12)}px;
      text-align: center;
      margin-bottom: 1mm;
      width: 100%;
  }
  .contact-info div {
      text-align: center;
      width: 100%;
  }
  .total { font-size: ${p(20)}px; font-weight: bold; }
  .small { font-size: ${p(14)}px; }
  .space { height: 1mm; display: block; }
  .firma { margin-top: 5mm; text-align: center; }
  .firma-line { border-top: 2px solid #000; width: 70%; margin: 1mm auto 0 auto; padding-top: 2mm; font-size: ${p(12)}px; }
  .amount-box { border: 2px solid #000; padding: 3mm; margin: 2mm 0; text-align: center; background: white; }
  .brand-header {
    text-align: center;
    margin: 0 auto 3mm auto;
    padding-bottom: 2mm;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .brand-title-stack {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: 1mm;
    line-height: 1;
    font-size: 0;
    margin-bottom: 1mm;
    width: 100%;
  }
  .brand-title-stack .logo-wrap {
    margin: 0 auto;
    padding: 0;
    min-height: 28mm;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
  }
  .brand-title-stack .header {
    margin-top: 0;
    padding-top: 0;
    text-align: center;
    width: 100%;
  }
  .brand-title-stack .subtitle {
    margin-top: 0;
    margin-bottom: 1mm;
    text-align: center;
    width: 100%;
  }
  .brand-contact {
    margin-top: 2mm;
    padding-top: 2mm;
    border-top: 1px dashed #bbb;
    text-align: center;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .brand-contact .contact-info {
    margin-bottom: 0;
    text-align: center;
    width: 100%;
  }
  .logo-wrap {
    text-align: center;
    margin: 0 auto;
    padding: 0;
    width: 100%;
    line-height: 0;
    font-size: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .print-logo {
    display: block;
    margin: 0 auto;
    padding: 0;
    vertical-align: top;
    ${vn}
  }
`,bn=async(n,i)=>{if(typeof window>"u")return{supported:!1,success:!1};try{const a=window.require;if(typeof a!="function")return{supported:!1,success:!1};const s=a("electron"),t=s==null?void 0:s.ipcRenderer;if(!(t!=null&&t.invoke))return{supported:!1,success:!1};const c=await t.invoke("printer:print-html",{html:n,silent:!!(i!=null&&i.silent),deviceName:i==null?void 0:i.deviceName});return{supported:!0,success:!!(c!=null&&c.success),error:typeof(c==null?void 0:c.error)=="string"?c.error:void 0}}catch(a){return console.error("electron invoke print error",a),{supported:!0,success:!1,error:a instanceof Error?a.message:String(a)}}},E=(n,i)=>{var a;try{const s=document.createElement("iframe");s.style.position="fixed",s.style.left="-9999px",s.style.top="-9999px",s.style.width="1px",s.style.height="1px",s.style.opacity="0",s.style.border="0",document.body.appendChild(s);const t=(a=s.contentWindow)==null?void 0:a.document;if(!t){setTimeout(()=>{try{s.remove()}catch(d){console.debug("No se pudo remover iframe temporal",d)}},1e3);return}let c=!1;const o=()=>{var d,v;if(!c){c=!0;try{(d=s.contentWindow)==null||d.focus(),(v=s.contentWindow)==null||v.print()}catch(f){console.debug("No se pudo lanzar la impresion del iframe",f)}setTimeout(()=>{try{s.parentNode&&document.body.removeChild(s)}catch(f){console.debug("No se pudo remover iframe despues de imprimir",f)}},1e3)}};s.onload=o,t.open(),t.write(n),t.close(),setTimeout(o,250)}catch(s){console.error("print iframe error",s)}};async function An(n,i,a,s=C,t){t!=null&&t.ownerAdminId&&pn(n,t,a==null?void 0:a.name);const{branding:c}=await x(t==null?void 0:t.ownerAdminId),o=i==null?void 0:i.find(r=>r.name===n.customerName),v=n.cashReceived??n.amountPaid,f=(a==null?void 0:a.name)??"",y=new Date(n.date);y.setDate(y.getDate()+30);const l=`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Factura ${n.invoiceNumber}</title>
      <style>${T}</style>
    </head>
    <body>
      <div class="ticket">
        ${A(c)}
        
        <div class="line">${w}</div>
        
        <div class="flex-row small"><span class="bold">FACT:</span> <span>${n.invoiceNumber}</span></div>
        <div class="flex-row small"><span class="bold">FECHA:</span> <span>${new Date(n.date).toLocaleDateString("es-DO")}</span></div>
        <div class="flex-row small"><span class="bold">HORA:</span> <span>${new Date(n.date).toLocaleTimeString("es-DO",{hour:"2-digit",minute:"2-digit"})}</span></div>

        <div class="line">${m}</div>

        ${f?`<div class="flex-row small"><span class="bold">EMPLEADO:</span> <span>${(f||"").substring(0,25)}</span></div>`:""}

        ${o?`
          <div class="flex-row small"><span class="bold">CLIENTE:</span> <span>${o.name.substring(0,25)}</span></div>
          <div class="flex-row small"><span class="bold">CED:</span> <span>${o.cedula}</span></div>
        `:n.customerName?`
              <div class="flex-row small"><span class="bold">CLIENTE:</span> <span>${n.customerName.substring(0,25)}</span></div>`:""}
        <div class="flex-row small"><span class="bold">PAGO:</span> <span>${n.status==="pending"?"PENDIENTE":n.status==="credito"&&n.amountPaid>0?"PAGO PARCIAL":n.paymentMethod==="cash"?"EFECTIVO":n.paymentMethod==="card"?"TARJETA":"TRANSF."}</span></div>
        
        <div class="line">${m}</div>
        <div class="center bold">DETALLE</div>
        <div class="line">${m}</div>
        
        ${n.items.map(r=>`
          <div class="line bold">${wn({name:r.name,boxNumber:r.boxNumber,category:r.category}).substring(0,h)}</div>
          <div class="flex-row">
              <span>${r.quantity} x $${e(r.customPrice??r.sellPrice)}</span>
              <span>$${e((r.customPrice??r.sellPrice)*r.quantity)}</span>
          </div>
        `).join("")}
        
        <div class="line">${m}</div>

        ${(()=>{const r=n.items.reduce((I,$)=>I+($.customPrice??$.sellPrice??0)*$.quantity,0),b=n.discount!==void 0?n.discount:Math.max(0,r-n.total);return b>0?`
              <div class="flex-row"><span>PRECIO ORIGINAL:</span> <span>$${e(r)}</span></div>
              <div class="flex-row"><span>DESCUENTO:</span> <span>-$${e(b)}</span></div>
            `:""})()}

        ${n.status==="credito"?`
          <div class="flex-row"><span>TOTAL VENTA:</span> <span>$${e(n.total)}</span></div>
          <div class="flex-row"><span>PAGADO EFECTIVO:</span> <span>$${e(n.amountPaid)}</span></div>
          <div class="flex-row bold"><span>FALTANTE CRÉDITO:</span> <span>$${e(n.total-n.amountPaid)}</span></div>
        `:v!==void 0&&n.change!==void 0&&n.change>0?`
          <div class="flex-row"><span>MONTO RECIBIDO:</span> <span>$${e(Number(v))}</span></div>
          <div class="flex-row"><span>CAMBIO:</span> <span>$${e(n.change)}</span></div>
        `:""}

        <div class="line">${w}</div>

        <div class="flex-row total">
          ${n.status==="credito"||n.paymentMethod==="credit"?'<div class="center bold" style="width: 100%; font-size: 18px;">ESTADO: CRÉDITO</div>':`<span>TOTAL:</span><span>$${e(n.total)}</span>`}
        </div>

        <div class="line">${w}</div>

        ${n.status==="pending"?'<div class="center bold small">PRE-FACTURA EN COLA (SIN COBRO)</div><div class="line">'+w+"</div>":""}

        ${n.status==="credito"||n.paymentMethod==="credit"?`
        <div class="firma">
          <div class="firma-line">Firma del Cliente</div>
        </div>
        <div class="space"></div>
        `:""}

        <div class="space"></div>
        <div class="center bold">GRACIAS POR SU COMPRA</div>
        ${_}
      </div>
    </body>
    </html>
  `;E(l)}async function Cn(n,i,a=C,s){s!=null&&s.ownerAdminId&&fn(n,i.name,{...s,source:"pago",paymentId:n.id});const{branding:t}=await x(s==null?void 0:s.ownerAdminId),c=n.paymentMethod==="cash"?"Efectivo":n.paymentMethod==="card"?"Tarjeta":"Transferencia",o=new Date(n.date),d=n.customerType==="almacen"?"ABONO A DEUDA CLIENTE ALMACEN":"ABONO A DEUDA CLIENTE",v=`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Pago - ${n.invoiceNumber}</title>
      <style>
        ${T}
        .payment-headline {
          text-align: center;
          font-weight: 900;
          font-size: ${p(15)}px;
          margin: 1.3mm 0 0.7mm 0;
        }
        .payment-subheadline {
          text-align: center;
          font-size: ${p(11)}px;
          font-weight: 700;
          letter-spacing: 0.3px;
          margin-bottom: 1mm;
        }
        .payment-method-badge {
          border: 1px solid #000;
          padding: 0.6mm 1.2mm;
          border-radius: 999px;
          font-size: ${p(11)}px;
          font-weight: 800;
          text-transform: uppercase;
        }
        .summary-card {
          border: 2px solid #000;
          margin: 1.8mm 0;
          padding: 1.4mm;
        }
        .summary-title {
          text-align: center;
          font-weight: 800;
          font-size: ${p(11)}px;
          margin-bottom: 0.6mm;
        }
        .summary-amount {
          text-align: center;
          font-size: ${p(26)}px;
          font-weight: 900;
          line-height: 1.05;
          margin: 0.8mm 0;
        }
      </style>
    </head>
    <body>
      <div class="ticket">
        ${A(t)}

        <div class="line">${w}</div>
        <div class="payment-headline">COMPROBANTE DE PAGO</div>
        <div class="payment-subheadline">${d}</div>
        <div class="line">${m}</div>

        <div class="flex-row small"><span class="bold">No. recibo:</span> <span>${n.invoiceNumber}</span></div>
        <div class="flex-row small"><span class="bold">Fecha:</span> <span>${o.toLocaleDateString("es-DO")}</span></div>
        <div class="flex-row small"><span class="bold">Hora:</span> <span>${o.toLocaleTimeString("es-DO",{hour:"2-digit",minute:"2-digit"})}</span></div>
        <div class="flex-row small"><span class="bold">Metodo:</span> <span class="payment-method-badge">${c}</span></div>

        <div class="line">${m}</div>
        <div class="line bold">CLIENTE</div>
        <div class="line">${i.name.substring(0,h)}</div>
        <div class="flex-row small"><span class="bold">Cedula:</span> <span>${i.cedula||"N/A"}</span></div>
        <div class="flex-row small"><span class="bold">Telefono:</span> <span>${i.phone||"N/A"}</span></div>

        <div class="summary-card">
          <div class="summary-title">MONTO ABONADO</div>
          <div class="summary-amount">$${e(n.amount)}</div>
        </div>

        <div class="line">${m}</div>
        <div class="line bold">ESTADO DE LA DEUDA</div>
        <div class="flex-row"><span>Antes:</span> <span>$${e(n.previousDebt)}</span></div>
        <div class="flex-row"><span>Abono:</span> <span>$${e(n.amount)}</span></div>
        <div class="flex-row bold"><span>Pendiente:</span> <span>$${e(n.remainingDebt)}</span></div>

        ${n.note?`<div class="line small">NOTA: ${n.note.substring(0,62)}</div>`:""}

        <div class="line">${w}</div>
        <div class="firma">
          <div class="firma-line">Firma del Cliente</div>
        </div>
        <div class="space"></div>
        <div class="center bold">Gracias por su pago</div>
        <div class="center small">Conserve este recibo como constancia.</div>
        ${_}
      </div>
    </body>
    </html>
  `;E(v)}async function Tn(n,i=C,a){const{branding:s}=await x(a),t=n.type==="reembolso"?"REEMBOLSO":n.type==="credito"?"CRÉDITO A FAVOR":"CAMBIO",c=`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Devolución - ${n.returnNumber}</title>
      <style>${T}</style>
    </head>
    <body>
      <div class="ticket">
        ${A(s)}

        <div class="line">${w}</div>
        <div class="center bold">NOTA DE CRÉDITO / DEVOLUCIÓN</div>
        <div class="line">${w}</div>
        
        <div class="flex-row small"><span class="bold">DEV:</span> <span>${n.returnNumber}</span></div>
        <div class="flex-row small"><span class="bold">FACT ORIG:</span> <span>${n.invoiceNumber}</span></div>
        <div class="flex-row small"><span class="bold">FECHA:</span> <span>${new Date(n.date).toLocaleDateString("es-DO")}</span></div>
        
        <div class="line">${m}</div>

        ${n.customerName?`<div class="line bold">CLIENTE:</div><div class="line">${n.customerName.substring(0,h)}</div>`:""}
          
        <div class="line bold">TIPO: ${t}</div>
        ${n.reason?`<div class="line small">MOTIVO: ${n.reason.substring(0,h)}</div>`:""}

        <div class="line">${m}</div>
        <div class="center bold">PRODUCTOS DEVUELTOS</div>
        <div class="line">${m}</div>

        ${n.items.map(o=>`
          <div class="line bold">${o.productName.substring(0,h)}</div>
          <div class="flex-row">
              <span>${o.quantity} x $${e(o.unitPrice)}</span>
              <span>$${e(o.subtotal)}</span>
          </div>
        `).join("")}

        <div class="line">${w}</div>

        <div class="amount-box">
          <div class="small">TOTAL DEVOLUCIÓN</div>
          <div class="total">$${e(n.total)}</div>
        </div>

        <div class="center small">Conserve este comprobante</div>
        <div class="space"></div>
      </div>
    </body>
    </html>
  `;E(c)}async function In(n,i=C,a){const{branding:s}=await x(a),t=`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Cierre - ${n.closingNumber}</title>
      <style>
        ${T}
        .section-title { 
            font-weight: bold; 
            text-align: center; 
            background: #000; 
            color: #fff; 
            margin: 2mm 0 1mm 0;
            padding: 1px 0;
        }
      </style>
    </head>
    <body>
      <div class="ticket">
        ${A(s)}
        <div class="center small bold">CIERRE DE CAJA</div>
        
        <div class="line">${w}</div>
        
        <div class="flex-row small"><span class="bold">NO:</span> <span>${n.closingNumber}</span></div>
        <div class="flex-row small"><span class="bold">FECHA:</span> <span>${n.date}</span></div>
        <div class="flex-row small"><span class="bold">CAJERO:</span> <span>${n.cashierName.substring(0,20)}</span></div>

        <div class="section-title">RESUMEN VENTAS</div>
        <div class="flex-row small"><span>Efectivo:</span> <span>$${e(n.salesByMethod.cash)}</span></div>
        <div class="flex-row small"><span>Tarjeta:</span> <span>$${e(n.salesByMethod.card)}</span></div>
        <div class="flex-row small"><span>Transf.:</span> <span>$${e(n.salesByMethod.transfer)}</span></div>
        <div class="flex-row small"><span>Crédito:</span> <span>$${e(n.salesByMethod.credit)}</span></div>
        <div class="line">${m}</div>
        <div class="flex-row bold"><span>TOTAL VENTAS:</span> <span>$${e(n.totalSales)}</span></div>

        <div class="section-title">MOVIMIENTOS</div>
        <div class="flex-row small"><span>(+) Pagos:</span> <span>$${e(n.totalPayments)}</span></div>
        <div class="flex-row small"><span>(+) Reparac.:</span> <span>$${e(n.totalRepairs)}</span></div>
        <div class="flex-row small"><span>(-) Devoluc.:</span> <span>$${e(n.totalReturns)}</span></div>
        <div class="flex-row small"><span>(-) Gastos:</span> <span>$${e(n.totalExpenses)}</span></div>

        <div class="section-title">CUADRE</div>
        <div class="flex-row small"><span>Saldo Inicial:</span> <span>$${e(n.openingBalance)}</span></div>
        <div class="flex-row small bold"><span>ESPERADO:</span> <span>$${e(n.expectedCash)}</span></div>
        <div class="flex-row small bold"><span>CONTADO:</span> <span>$${e(n.countedCash)}</span></div>
        
        <div class="line">${m}</div>
        <div class="flex-row bold">
            <span>DIFERENCIA:</span> 
            <span>$${e(n.discrepancy)}</span>
        </div>
        
        <div class="center small" style="margin-top: 5mm;">
            ${n.discrepancy===0?"CUADRE PERFECTO":n.discrepancy>0?"FALTANTE":"SOBRANTE"}
        </div>

        <div class="space"></div>
        <div class="firma">
          <div class="firma-line">Firma Cajero</div>
        </div>
        <div class="space"></div>
      </div>
    </body>
    </html>
  `;E(t)}async function Pn(n,i=C,a){const{branding:s}=await x(a),t=`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Cierre Almacen - ${n.closingNumber}</title>
      <style>
        ${T}
        .section-title {
          font-weight: bold;
          text-align: center;
          background: #000;
          color: #fff;
          margin: 2mm 0 1mm 0;
          padding: 1px 0;
        }
        .note-box {
          border: 1px dashed #000;
          padding: 2mm;
          margin-top: 2mm;
          font-size: ${p(13)}px;
        }
      </style>
    </head>
    <body>
      <div class="ticket">
        ${A(s)}
        <div class="center small bold">CIERRE DE ALMACEN</div>

        <div class="line">${w}</div>

        <div class="flex-row small"><span class="bold">NO:</span> <span>${n.closingNumber}</span></div>
        <div class="flex-row small"><span class="bold">FECHA:</span> <span>${n.date}</span></div>
        <div class="flex-row small"><span class="bold">RESPONSABLE:</span> <span>${n.cashierName.substring(0,20)}</span></div>

        <div class="section-title">RESUMEN</div>
        <div class="flex-row small"><span>Productos:</span> <span>${n.totalProducts}</span></div>
        <div class="flex-row small"><span>Unid. esperadas:</span> <span>${n.totalUnitsExpected}</span></div>
        <div class="flex-row small"><span>Unid. contadas:</span> <span>${n.totalUnitsCounted}</span></div>
        <div class="flex-row small bold"><span>Diferencia unid.:</span> <span>${n.discrepancyUnits}</span></div>
        <div class="line">${m}</div>
        <div class="flex-row small"><span>Costo esperado:</span> <span>$${e(n.totalCostExpected)}</span></div>
        <div class="flex-row small"><span>Costo contado:</span> <span>$${e(n.totalCostCounted)}</span></div>
        <div class="flex-row bold"><span>Diferencia costo:</span> <span>$${e(n.discrepancyCost)}</span></div>

        ${n.financialSummary?`
          <div class="section-title">CIERRE INFORMADO</div>
          <div class="flex-row small"><span>Total Facturado:</span> <span>$${e(n.financialSummary.totalSales)}</span></div>
          <div class="flex-row small"><span>Facturas:</span> <span>${n.financialSummary.invoiceCount}</span></div>
          <div class="flex-row small"><span>En Efectivo:</span> <span>$${e(n.financialSummary.cashNet)}</span></div>
          <div class="flex-row small"><span>En Tarjeta:</span> <span>$${e(n.financialSummary.cardNet)}</span></div>
          <div class="flex-row small"><span>Transferencias:</span> <span>$${e(n.financialSummary.transferNet)}</span></div>
          <div class="flex-row small"><span>A Credito:</span> <span>$${e(n.financialSummary.creditNet)}</span></div>
          <div class="flex-row small"><span>Devoluciones:</span> <span>-$${e(n.financialSummary.totalReturns)}</span></div>
          <div class="flex-row small"><span>Abonos Deuda (Efectivo):</span> <span>$${e(n.financialSummary.cashDebtPayments)}</span></div>
          <div class="line">${m}</div>
          <div class="flex-row bold"><span>Ventas Netas de Almacen:</span> <span>$${e(n.financialSummary.netIncome)}</span></div>
        `:""}

        <div class="section-title">ESTADO</div>
        <div class="center small" style="margin-top: 1mm;">
          ${n.discrepancyUnits===0&&n.discrepancyCost===0?"CUADRE PERFECTO":"REQUIERE REVISION"}
        </div>

        ${n.notes?`<div class="note-box"><div class="bold">Notas:</div><div>${n.notes}</div></div>`:""}

        <div class="space"></div>
        <div class="firma">
          <div class="firma-line">Firma Responsable</div>
        </div>
        <div class="space"></div>
      </div>
    </body>
    </html>
  `;E(t)}const O={0:"nnnwwnwnn",1:"wnnwnnnnw",2:"nnwwnnnnw",3:"wnwwnnnnn",4:"nnnwwnnnw",5:"wnnwwnnnn",6:"nnwwwnnnn",7:"nnnwnnwnw",8:"wnnwnnwnn",9:"nnwwnnwnn",A:"wnnnnwnnw",B:"nnwnnwnnw",C:"wnwnnwnnn",D:"nnnnwwnnw",E:"wnnnwwnnn",F:"nnwnwwnnn",G:"nnnnnwwnw",H:"wnnnnwwnn",I:"nnwnnwwnn",J:"nnnnwwwnn",K:"wnnnnnnww",L:"nnwnnnnww",M:"wnwnnnnwn",N:"nnnnwnnww",O:"wnnnwnnwn",P:"nnwnwnnwn",Q:"nnnnnnwww",R:"wnnnnnwwn",S:"nnwnnnwwn",T:"nnnnwnwwn",U:"wwnnnnnnw",V:"nwwnnnnnw",W:"wwwnnnnnn",X:"nwnnwnnnw",Y:"wwnnwnnnn",Z:"nwwnwnnnn","-":"nwnnnnwnw",".":"wwnnnnwnn"," ":"nwwnnnwnn",$:"nwnwnwnnn","/":"nwnwnnnwn","+":"nwnnnwnwn","%":"nnnwnwnwn","*":"nwnnwnwnn"},u=n=>n.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"),R=(n,i)=>n.length>i?`${n.slice(0,Math.max(0,i-3)).trim()}...`:n,$n=n=>{const i=n.trim().split(/\s+/).map(s=>s.replace(/[^0-9A-Za-z]/g,"")).filter(Boolean);return i.length?i.length===1?i[0].slice(0,4).toUpperCase():i.slice(0,3).map(s=>/^\d+$/.test(s)&&s.length<=3?s:s[0]).join("").toUpperCase()||"EMP":"EMP"},hn=un,xn=n=>{const i=n.toUpperCase().replace(/\s+/g," ").trim();return Array.from(i).map(s=>s!=="*"&&O[s]?s:"-").join("")||"SIN-ID"},En=n=>{const i=`*${n}*`,a=2,s=5,t=60,c=2;let o=0;const d=[];return Array.from(i).forEach((v,f)=>{const y=O[v]||O["-"];Array.from(y).forEach((l,r)=>{const b=l==="w"?s:a;r%2===0&&d.push(`<rect x="${o}" y="0" width="${b}" height="${t}" fill="#000" />`),o+=b}),f<i.length-1&&(o+=c)}),`
    <svg viewBox="0 0 ${o} ${t}" preserveAspectRatio="none" role="img" aria-label="Codigo de barras ${u(n)}">
      ${d.join("")}
    </svg>
  `};async function Dn(n,i,a){var H,j;const{branding:s}=await x(a),t=((H=n.companyName)==null?void 0:H.trim())||((j=s.businessName)==null?void 0:j.trim())||$n(s.businessName)||hn,c=1.1,o=-4,d=g=>Number((g*c).toFixed(2)),v=Math.max(1,Math.floor(n.copies||1)),f=(n.boxLabel||"Caja").trim(),l=(n.printerProfile==="2c-lp281b"?"2c-lp281b":"default")==="2c-lp281b",r=String(n.productName||"").trim(),b=String(n.component||"").trim(),I=String(n.details||"").trim(),$=String(n.imei||"").trim(),L=String(n.caja||"").trim()||"SIN-ID",V=l?18:30,G=xn(L).slice(0,V).trim()||"SIN-ID",Y=En(G),q=R(L.toUpperCase(),l?22:40),P=$?R($.toUpperCase(),l?24:36):"",M=[b,I].filter(Boolean).map(g=>R(g.toUpperCase(),l?24:38)),W=!n.hideProductName&&!!r,D=r.length,X=l?D>48?6.1:D>34?6.8:7.6:D>66?9.8:D>48?11:12.4,J=d(X),Z=l?1.07:1.1,K=l?8:12,F=l?38:58,z=l?27:40,Q=l?.55:2,nn=l?1.05:2.2,sn=l?1.5:2.4,en=d(l?15.5:24),an=l?.45:1.3,tn=d(l?6.1:8.9),ln=l?1.08:1.1,on=l?P?4.9:5.7:P?8.6:9.4,k=l?.25:.8,rn=d(l?5.4:8.3),cn=d(l?7.1:10.6),dn=`
    @page { size: ${F}mm ${z}mm; margin: 0; }
    body {
      margin: 0;
      padding: 0;
      background: #fff;
      font-family: Arial, Helvetica, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .label-page {
      width: ${F}mm;
      height: ${z}mm;
      box-sizing: border-box;
      padding: ${Q}mm;
      display: flex;
      align-items: stretch;
      justify-content: stretch;
      overflow: hidden;
      page-break-after: always;
    }
    .label-page:last-child {
      page-break-after: auto;
    }
    .label {
      width: 100%;
      height: 100%;
      border: 0;
      border-radius: ${sn}mm;
      padding: ${nn}mm;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 0;
      color: #000;
      font-weight: 500;
      text-rendering: optimizeLegibility;
      -webkit-font-smoothing: antialiased;
      background: #fff;
      overflow: hidden;
    }
    .company-short,
    .product-name,
    .meta-line,
    .imei-line,
    .identifier {
      transform: translateX(${o}%);
    }
    .company-short {
      font-size: ${en}px;
      line-height: 1;
      font-weight: 900;
      text-align: center;
      text-transform: uppercase;
      letter-spacing: 0.25px;
      margin-bottom: ${an}mm;
    }
    .product-name {
      font-size: ${J}px;
      line-height: ${Z};
      font-weight: 800;
      text-align: center;
      text-transform: uppercase;
      max-height: ${K}mm;
      overflow: hidden;
      word-break: break-word;
      overflow-wrap: anywhere;
    }
    .meta {
      margin-top: 0.45mm;
      display: flex;
      flex-direction: column;
      gap: 0.18mm;
    }
    .meta-line {
      font-size: ${tn}px;
      line-height: ${ln};
      text-align: center;
      text-transform: uppercase;
      font-weight: 700;
      color: #111;
    }
    .barcode-wrap {
      margin-top: ${k}mm;
      padding-top: ${k}mm;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .imei-line {
      margin-bottom: ${l?.16:.4}mm;
      font-size: ${rn}px;
      line-height: 1.05;
      font-weight: 700;
      text-align: center;
      text-transform: uppercase;
      letter-spacing: 0.02em;
      color: #111;
      word-break: break-word;
      overflow-wrap: anywhere;
    }
    .barcode {
      width: 100%;
      height: ${on}mm;
      overflow: hidden;
    }
    .barcode svg {
      width: 100%;
      height: 100%;
      display: block;
      shape-rendering: crispEdges;
    }
    .identifier {
      margin-top: 0.5mm;
      font-size: ${cn}px;
      line-height: 1;
      font-weight: 900;
      text-align: center;
      letter-spacing: ${l?.6:.95}px;
      text-transform: uppercase;
      word-break: break-word;
      overflow-wrap: anywhere;
    }
  `,mn=Array.from({length:v},()=>`
    <div class="label-page">
      <div class="label">
        <div class="company-short">${u(t)}</div>
        ${W?`<div class="product-name">${u(r)}</div>`:""}
        ${M.length?`
            <div class="meta">
              ${M.map(g=>`<div class="meta-line">${u(g)}</div>`).join("")}
            </div>
          `:""}
        <div class="barcode-wrap">
          ${P?`<div class="imei-line">IMEI: ${u(P)}</div>`:""}
          <div class="barcode">${Y}</div>
          <div class="identifier">${u(f.toUpperCase())}: ${u(q)}</div>
        </div>
      </div>
    </div>
  `).join(""),B=`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Etiqueta ${u(r||"Producto")}</title>
      <style>${dn}</style>
    </head>
    <body>
      ${mn}
    </body>
    </html>
  `,U=(i==null?void 0:i.silent)!==!1,S=await bn(B,{silent:U});if(S.supported){const g=U?"electron-silent":"print-dialog";return S.success?{success:!0,mode:g}:{success:!1,mode:g,error:S.error||"No se pudo imprimir la etiqueta."}}return E(B),{success:!0,mode:"print-dialog"}}export{hn as S,Cn as a,Dn as b,Tn as c,Pn as d,In as e,An as p};
