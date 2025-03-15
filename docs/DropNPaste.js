/* globals QRCode */
/* globals Peer */
/* globals marked */

class ProgressBar {
	constructor(elem) {
		this.elem = elem;
	}

	setValue(val) {
		const blocks = this.elem.querySelectorAll(':scope > .block-meter');
		const maxBlock = Math.floor(val * (blocks.length+1));
		for(let b = 0; b < blocks.length; ++b) {
			const opacity = b >= maxBlock ? 0 : 1;
			blocks[b].style.opacity = opacity;
			if(b == maxBlock) {
				blocks[b].classList.add('flash');
			} else {
				blocks[b].classList.remove('flash');
			}
		}
	}

	show(b) {
		this.elem.style.display = b ? 'grid': 'none';
	}
}

/*
class OverrideConnectionProgress {
	constructor(conn) {
		this.conn = conn;
		this.total = 0;
		this.upto = 0;
		this.progressTimeout = 30000;
		this.progressTimeoutId = null;
		this.init(conn);
		this.nextSendProgress = null;
	}

	onProgress(upto, total) {
	}


	sendProgress(upto, total) {
		const now = new Date().getTime();
		if(this.nextSendProgress === null || now >= this.nextSendProgress || upto >= (total-1)) {
			this.conn.send({type:'progress', upto, total});
			this.nextSendProgress = now + (50);
		}
		this.onProgress(upto,total);
	}


	// onMessage(conn, chunkedData, key) { }

	init(conn) {
		const t=this;
		if (conn.dataChannel && conn.dataChannel.onmessageOrig) {
			// already setup
			return;
		}
		this.progressTimeout = 30000;
	}
}
	*/


class HelpButton {
	constructor() {
		this.helpDiv = document.getElementById('help-div');
		window.addEventListener('click',() => {
			this.helpDiv.style.display='none';
		});
		this.helpButton = document.getElementById('help-button');
		this.helpButton.addEventListener('click',() => {
			this.show();
		});
	}
	show() {
		return fetch('README.md').then((resp) => {
			return resp.text();
		}).then((md) => {
			this.helpDiv.innerHTML = marked.parse(md);
			this.helpDiv.style.display='';
		});
	}
}

class Messages {
	constructor() {
		this.messagesDiv=document.getElementById('messages');
	}

	removeOldMessages() {
		if(this.messagesDiv.children.length > 500) {
			while(this.messagesDiv.children.length > 400) {
				this.messagesDiv.removeChild(this.messagesDiv.children[this.messagesDiv.children.length-1]);
			}
		}
	}
	getCurrentHMS() {
		const now = new Date();
		const hours = String(now.getHours()).padStart(2, '0');
		const minutes = String(now.getMinutes()).padStart(2, '0');
		const seconds = String(now.getSeconds()).padStart(2, '0');
		return `${hours}:${minutes}:${seconds}`;
	}
	addMessage(html, cls) {
		const hms = this.getCurrentHMS();
/*
		if(this.lastAddMessage == html) {
			const firstMessage = this.messagesDiv.children[0];
			if(firstMessage) {
				const hmsSpan = firstMessage.querySelector('.hms');
				hmsSpan.innerHTML = hms;
			}
			return;
		}
*/
		this.lastAddMessage = html;

		const newMessage = document.createElement('p');
		newMessage.innerHTML = `<span class='hms'>${hms}</span> <span>${html}</span>`;
		if(cls)
			newMessage.className = cls;
		this.messagesDiv.insertBefore(newMessage, this.messagesDiv.children[0]);
		this.removeOldMessages();
		console.log(html);
	}
}

class DropNPaste {
	constructor() {
		// settings
		this.reconnectPeerMaxWait = (60000*1);
		this.pasteAreaTimeoutWait = 1200; // millisecs to wait before uploading changes to

		// init
		this.peer = null;
		this.conn = null;
		this.sendMode = false;
		this.reconnectCount = 0;
		this.reconnectPeerTimeout = null;
		this.reconnectPeerTimeoutWait = 500;
		this.pasteAreaTimeout = null;
		this.lastPasteAreaValue = '';
		this.fileList = null;
		this.fileListUpto = 0;
		this.filePartSize = 2000000;
		this.filePartUpto = 0;
		this.filePartArray = null;
		this.helpButton = new HelpButton();
		this.debug = 0;
		this.progressTimeout = 30000;
	}

	//////////////////////

	addBodyClass(name, add) {
		if(add) {
			document.body.classList.add(name);
		} else {
			document.body.classList.remove(name);
		}
	}

	async setSendMode() {
		document.body.classList.add('send-mode');
		document.body.classList.remove('recv-mode');
		this.sendMode = true;
		// this.initPeer(await this.getThisId());
	}

	setRecvMode() {
		document.body.classList.remove('send-mode');
		document.body.classList.add('recv-mode');
		this.sendMode = false;
	}

	//////////////////////

	initButtons() {
		const sendButton=document.getElementById('send');
		const recvButton=document.getElementById('recv');
		sendButton.addEventListener('click', () => this.setSendMode());
		recvButton.addEventListener('click', () => this.setRecvMode());
		this.peerIdInput.addEventListener('change',async () =>
			this.changePeerId(this.peerIdInput.value.trim())
		);
		this.thisIdInput.addEventListener('change',async () => {
			const id = this.thisIdInput.value.trim();
			this.initPeer(id);
			// user has changed the name, let's keep it
			this.changeThisId(id);
			localStorage.setItem('thisIdIsRandom', false);
			localStorage.setItem('thisid', id);
		});
	}

	initSearchParams() {
		this.searchParams = new URLSearchParams(location.search.substring(1));
		if(this.searchParams.get('debug') !== null) {
			this.debug = this.searchParams.get('debug');
		}
	}

	async init() {
		this.initSearchParams();
		this.initReconnect();

		this.messages = new Messages();
		this.peerIdInput=document.getElementById('peerid');
		this.thisIdInput=document.getElementById('thisid');
		const peerId = this.getPeerId();
		if(peerId !== null) {
			this.peerIdInput.value = peerId;
		}

		this.initButtons();
		this.initDropArea();
		this.initFileSelector();
		this.initPeer(await this.getThisId());

		const peerIdParam = this.searchParams.get('peerid');
		if((peerIdParam !== null && peerIdParam !== "")
		|| this.searchParams.get('send') !== null) {
			this.setSendMode();
		} else {
			this.setRecvMode();
		}
	}

	initProgressBar(/* conn */) {
		if(!this.progressBar)
			this.progressBar = new ProgressBar(document.getElementById('progress-bar'));
	}

	//////////////////////

	sendPasteArea() {
		if(this.lastPasteAreaValue == this.pasteArea.value) {
			console.log('Not sending, text has not changed');
			return;
		}
		if (!this.conn) {
			this.messages.addMessage(`No connection to send to`,'error');
			return;
		}
		if(this.debug) {
			this.messages.addMessage(`send text ${this.conn.peer} ${this.conn.dataChannel.label}`,'');
			console.log('conn text',this.conn);
		}
		this.conn.send({type:'text', value:this.pasteArea.value});
		this.lastPasteAreaValue = this.pasteArea.value;
	}

	changePasteArea() {
		if (this.pasteAreaTimeout) {
			clearTimeout(this.pasteAreaTimeout);
		}
		this.pasteAreaTimeout = setTimeout(() => {
			this.pasteAreaTimeout = null;
			this.sendPasteArea();
		},this.pasteAreaTimeoutWait);
	}

	initPasteArea(elem) {
		this.pasteArea=elem;
		this.pasteArea.addEventListener('keypress', () => this.changePasteArea());
		this.pasteArea.addEventListener('click', () => this.changePasteArea());
		this.pasteArea.addEventListener('change', () => this.changePasteArea());
		this.pasteArea.addEventListener('paste', () => this.changePasteArea());
	}

	//////////////////////


	getId(input, name) {
		let id = input.value.trim();
		if(id == "") {
			id = this.searchParams.get(name);
			if(id === null) {
				id = localStorage.getItem(name);
			}
			if(id !== null) {
				input.value = id;
			}
		}
		return id;
	}

	getRandomName() {
		try {
			const url = 'https://random-word-api.herokuapp.com/word?number=2';
			return fetch(url).then((response) => {
				if (!response.ok) {
					throw new Error(`Response status: ${response.status}`);
				}
				return response.json();
			}).then((json) => {
				function cap(s) {
					return s.substring(0,1).toUpperCase()+s.substring(1);
				}
				return cap(json[0])+cap(json[1]);
			});
		} catch (error) {
			console.error(error.message);
		}
		return null;
	}

	getThisId() {
		const oldId = this.thisIdInput.value.trim();
		const id = this.getId(this.thisIdInput, 'thisid');
		if (id == "" || id === null) {
			return this.getRandomName().then((id) => {
				if(id !== null) {
					this.changeThisId(id);
					localStorage.setItem('thisIdIsRandom', true);
					return id;
				}
			});
		}
		if(oldId != id) {
			this.changeThisId(id, true);
		}
		return id;
	}

	async changePeerId(peerId) {
		if(peerId == "" || peerId === null) {
			this.searchParams.delete('peerid');
			localStorage.removeItem('peerid');
		} else {
			this.searchParams.set('peerid', peerId);
			localStorage.setItem('peerid', peerId);
		}
		window.history.pushState(
			{},
			'',
			'?' + this.searchParams.toString()
		);
		this.initPeer(await this.getThisId());
	}

	changeThisId(id, force) {
		if(localStorage.getItem('thisid') === null)
			localStorage.setItem('thisid', id);
		if(force || this.thisIdInput.value != id) {
			this.thisIdInput.value = id;

			const url = `${location.protocol}//${location.host}${location.pathname}?peerid=${id}`;

			if(this.qrcode) {
				this.qrcode.clear(); // clear the code.
				this.qrcode.makeCode(url);
			} else {
				document.getElementById('qrcode-container').style.display='';
				const qrcodeDiv = document.getElementById('qrcode');
				const qrcodeLink = document.getElementById('qrcode-link');
				this.qrcode = new QRCode(qrcodeDiv, {
					text: url,
					colorDark : "#000000",
					colorLight : "#ffffff",
					correctLevel : QRCode.CorrectLevel.H
				});
				qrcodeLink.href = url;
				qrcodeLink.innerHTML = url;
			}
		}
	}

	getPeerId() {
		return this.getId(this.peerIdInput, 'peerid');
	}

	setConnection(conn) {
		this.conn = conn;
	}

	//////////////////////

	onPeerOpen(showConnecting) {
		const peerId = this.getPeerId();
		console.log('onPeerOpen', peerId);
		if(peerId === null || peerId === "") {
			return;
		}
		if(showConnecting) {
			this.addBodyClass('show-peerid-connecting', true);
		}
		this.setConnection( this.peer.connect(peerId, {}) );
		if(!this.conn) {
			console.error('connection failed');
			return;
		}
		this.initProgressBar(this.conn);
		// on open will be launch when you successfully connect to PeerServer
		this.conn.on('connection', () => {
			console.log('send connection');
		});
		this.conn.on('data', (data) =>
			this.processData(data)
		);
		this.conn.on('close', () => {
			console.log('Connection closed to: ${this.conn.peer}');
			this.addConnectedClass(false);
			if(this.debug)
				this.messages.addMessage(`close`, '');
			// This will trigger if the other side closes.
			this.reconnectPeer();
		});
		this.conn.on('open', () => {
			// here you have conn.id
			this.addBodyClass('show-peerid-connecting', false);
			this.addBodyClass('peer-unavailable', false);
			this.addConnectedClass(true);
			this.setPeerIdIfBlank(peerId);
			this.messages.addMessage(`Connected to: ${peerId}`, '');
			this.reconnectPeerTimeoutWait = 500;
			this.sendFile();
		});
		this.conn.on('error', (err) => {
			this.messages.addMessage(`Connection error: ${err}`, 'error');
			this.reconnectPeer();
		});
	}

	setPeerIdIfBlank(peerId) {
		if(this.searchParams.get('peerid') === null) {
			this.searchParams.set('peerid', peerId);
			window.history.pushState(
				{},
				'',
				'?' + this.searchParams.toString()
			);
		}
		if(this.peerIdInput.value.trim() === "") {
			this.peerIdInput.value = peerId;
		}
	}

	initReconnect() {
		if(!navigator.connection) {
			return false;
		}
		navigator.connection.addEventListener(
			'change',
			() => this.reconnectPeerForceOnFailure()
		);
		return true;
	}

	reconnectPeerForceOnFailure() {
		console.log('reconnectPeerForceOnFailure',this.peer,this.conn);
		if(
			(this.peer && this.peer.disconnected)
			|| (!this.conn || !this.conn.open)
		) {
			this.reconnectPeerForce();
		}
	}

	reconnectPeerForce() {
		if(this.reconnectPeerTimeout) {
			clearTimeout(this.reconnectPeerTimeout);
			this.reconnectPeerTimeout = null;
		}
		this.reconnectPeer();
	}

	reconnectPeer() {
		if(this.reconnectPeerTimeout) {
			console.log("already trying to reconenct");
			return;
		}
		this.reconnectPeerTimeout = setTimeout(async () => {
			if(this.peer.disconnected) {
				this.initPeer(await this.getThisId());
			} else {
				this.onPeerOpen(false);
			}

			if(this.reconnectPeerTimeoutWait < this.reconnectPeerMaxWait) {
				this.reconnectPeerTimeoutWait *= 1.5;
			}
			this.reconnectPeerTimeout = null;
		}, (Math.random()*this.reconnectPeerTimeoutWait) + this.reconnectPeerTimeoutWait);
	}

	//////////////////////

	showNextImage() {
		const currentShown = this.recvImg.querySelector(':scope > img.show-img');
		let prevImg = null;
		if(currentShown) {
			currentShown.classList.remove('show-img');
			prevImg = currentShown.previousSibling;
		}
		if(!prevImg) {
			const imgs = this.recvImg.querySelectorAll(':scope > img');
			prevImg = imgs[imgs.length-1];
		}
		if(prevImg) {
			prevImg.classList.add('show-img');
		}
	}

	addImage(url, alt) {
		if(!this.recvImg) {
			this.recvImg = document.getElementById('recv-img');
			this.recvImg.addEventListener('click',() => this.showNextImage());
			this.recvImg.addEventListener('keypress',() => this.showNextImage());
		}

		const currentShowns = this.recvImg.querySelectorAll(':scope > img.show-img');
		const img = document.createElement('img');
		img.alt = alt;
		img.src = url;
		img.classList.add('show-img');

		for(const showImg of currentShowns) {
			showImg.classList.remove('show-img');
		}
		this.recvImg.appendChild(img);
	}

	//////////////////////

	downloadFilePartsFinal() {
		let len = 0;
		for(const part of this.downloadFileParts) {
			len += part.byteLength;
		}
		const array = new Uint8Array(len);
		let offset = 0;
		for(const part of this.downloadFileParts) {
			array.set(new Uint8Array(part), offset);
			offset += part.byteLength;
		}
console.log('file parts final', len, array, this.downloadFileParts);
		this.downloadFile({array:[array], filename:this.downloadFilename});
	}
	downloadFilePart(data) {
		if(data.upto == 0) {
			this.downloadFileParts = [];
			this.downloadFilename = data.filename;
			this.downloadPartsCount = data.parts_count;
		}
console.log('dddarray',data.array, this.downloadFileParts);
		if(!data.array.byteLength) {
			this.downloadFilePartsFinal(data.filename);
			this.downloadFileParts = [];
		} else {
			this.downloadFileParts.push(data.array);
			this.conn.send({type:'received_part', upto:data.upto});
		}
console.log('dddarray2',data.array, this.downloadFileParts);
		this.progressBar.setValue(data.upto / this.downloadPartsCount);
		this.progressBar.show(true);
	}

	downloadFile(data) {
		this.messages.addMessage(`Downloaded: ${data.filename}`, '');
		var file = new Blob(data.array, {type: "application/octet-stream"});

		if(/\.(png|jpg|gif|avif|webp|svg|bmp)$/i.exec(data.filename)) {
			if(file.size<20000000) {
				const url = URL.createObjectURL(file);
				this.addImage(url, data.filename);
			} else {
				console.log(`Image too big, not showing: ${data.filename}, ${file.size}`);
			}
		}

		var a = document.createElement("a"), url = URL.createObjectURL(file);
		a.href = url;
		a.download = data.filename;
		document.body.appendChild(a);
		a.click();
		this.conn.send({type:'received', filename:data.filename});
	}

	//////////////////////

	receivedText(data) {
		const recvText = document.getElementById('recv-text');
		recvText.innerHTML = data.value;
		if(data.value != "") {
			recvText.classList.add('has-text');
		} else {
			recvText.classList.remove('has-text');
		}
	}

	//////////////////////

	processData(data) {
		if(this.debug) {
			this.messages.addMessage(`data ${data.type} ${this.conn.peer} ${this.conn.dataChannel.label}`,'');
			console.log('data', data);
		}
		if(data.type == 'startoflist') {
			return;
		} else if(data.type == 'endoflist') {
			console.log('endoflist received',data);
			if(data.length >= 3) {
				this.messages.addMessage(`Files received: ${data.length}`, '');
			}
			setTimeout(() => 
				this.progressBar.show(false)
			,500);
			return;
		} else if(data.type == 'progress') {
			this.progressBar.setValue(data.upto / data.total);
			this.progressBar.show(true);
			this.startProgressTimeout();
		} else if(data.type == 'received') {
			if(this.debug)
				this.messages.addMessage(`Sent: ${data.filename}`, '');
			this.nextFile();
		} else if(data.type == 'received_part') {
			this.nextFilePart();
		} else if(data.type == 'progress_stopped') {
			console.log('progress_stopped message');
			this.reconnect();
		}


		document.getElementById('text-intro').style.display='none';
		if(data.type == 'text') {
			console.log('received text');
			this.receivedText(data);
			return;
		} else if(data.type == 'file_part') {
			this.downloadFilePart(data);
		} else if(data.type == 'file') {
			this.downloadFile({array:[data.array], filename:data.filename});
		}
	}

	addConnectedClass(r) {
		this.addBodyClass('connected', r);
	}

	// connection opened from sender on receiver. Save file
	onConnOpen(conn) {
		this.setConnection(conn);
		this.conn.on('data', (data) =>
			this.processData(data)
		);
		this.conn.on('close', () => {
			console.log('connection closed');
		});
		this.conn.on('open', () => {
			this.messages.addMessage(`Connected from: ${this.conn.peer}`, '');
			this.addConnectedClass(true);
			console.log('connection opened');
			if(this.conn)
				this.initProgressBar(this.conn);
		});
		this.conn.on('error', (err) => {
			this.messages.addMessage(`connection error: ${err}`,'error');
		});
	}

	initPeer(id) {
		if(this.debug)
			this.messages.addMessage(`initPeer`, '');
		if(this.peer) {
			this.peer.destroy();
		}
		this.peer = new Peer(id, {debug:this.searchParams.get('debug') || 2} );
		this.peer.on('open', () => {
			this.onPeerOpen(true);
			if(localStorage.getItem('thisid') === null)
				localStorage.setItem('thisid', id);
		});
		this.peer.on('connection', (conn) => {
			this.onConnOpen(conn);
			this.reconnectCount = 0;
		});
		this.peer.on('error', (err) => {
			this.messages.addMessage(`peer error: ${err} ${err.type}`, 'error');
			const reconnectTypes = {
				'server-error':true,
				'socket-error':true,
				'socket-closed':true,
				'peer-unavailable':true,
				'network':true,
			};
			if(err.type == 'unavailable-id') {
				this.messages.addMessage('Is more than one tab opened? Please use a private tab if you wish to open more than one tab. Or pick a new name.', 'error');
				return;
			}
			if(err.type == 'peer-unavailable') {
				this.addConnectedClass(false);
				this.addBodyClass('peer-unavailable', true);
				this.addBodyClass('show-peerid-connecting', false);
			}
			if(reconnectTypes[err.type]) {
				this.reconnectPeer();
			}
		});
		this.peer.on('close', () => {
			if(this.debug)
				this.messages.addMessage(`peer.close`, '');
			console.log(`Closed from ${id}`,this.peer);
			this.addConnectedClass(false);
			this.addBodyClass('show-peerid-connecting', false);
			// this.reconnect();
		});
		this.peer.on('disconnected', () => {
			if(this.debug)
				this.messages.addMessage(`disconnected`, '');
			console.log(`Disconnected from ${id}`,this.peer);
			this.addConnectedClass(false);
			this.addBodyClass('show-peerid-connecting', false);
			this.reconnect();
		});
	}

	reconnect() {
		setTimeout(() => {
			if(!this.peer.destroyed && this.reconenctCount < 5) {
				this.peer.reconnect();
				++this.reconnectCount;
			}
		}, Math.random()*2000);
	}

	//////////////////////
	// Progress timeout

	async onProgressStopped() {
		this.messages.addMessage(`No progress, reconnect`,'');
		this.startProgressTimeout();
		this.initPeer(await this.getThisId());
	}

	stopProgressTimeout() {
		if(this.progressTimeoutId) {
			clearTimeout(this.progressTimeoutId);
			this.progressTimeoutId = null;
		}
	}

	startProgressTimeout() {
		this.stopProgressTimeout();
		this.progressTimeoutId = setTimeout(
			() => this.onProgressStopped(),
			this.progressTimeout
		);
	}


	//////////////////////
	// Upload file

	uploadFileList(fileList) {
		this.fileList = fileList;
		this.fileListUpto = 0;
		this.startProgressTimeout();
		this.conn.send({type:'startoflist', length:this.fileList.length});
		this.sendFile();
	}

	nextFile() {
		++this.fileListUpto;
		this.sendFile();
	}

	sendFile() {
		if(!this.fileList)
			return;
		if(!this.conn.open) {
			console.log('connection not open, reconnect');
			this.reconnect();
			return;
		}
		const file = this.fileList[this.fileListUpto];
		if(!file) {
			if(this.fileList.length >= 3 ) {
				this.messages.addMessage(`Files sent: ${this.fileList.length}`, '');
			}
			this.stopProgressTimeout();
			setTimeout(() => 
				this.progressBar.show(false)
			,500);
			this.conn.send({type:'endoflist', length:this.fileList.length});
			this.fileList = null;
			return;
		}
		this.readFile(file);
	}

	//////////////////////

	nextFilePart() {
		// filePartArray is an ArrayBuffer
		const start = this.filePartUpto * this.filePartSize;
		const array = this.filePartArray.slice(start, start + this.filePartSize);
		const obj = {
			type:'file_part',
			array,
			upto:this.filePartUpto,
		};
		this.progressBar.setValue(start / this.filePartArray.byteLength);
		this.progressBar.show(true);


		if(this.filePartUpto == 0) {
			obj.filename = this.filePartFilename;
			obj.parts_count = Math.floor(this.filePartArray.byteLength / this.filePartSize) + 1;
		}
		if(this.debug) {
			this.messages.addMessage(`send file_part, len: ${array.byteLength}`, '');
		}
		this.conn.send(obj);
		++this.filePartUpto;
	}

	sendFileParts(array, filename) {
		this.filePartUpto = 0;
		this.filePartFilename = filename;
		this.filePartArray = array;
		this.nextFilePart();
	}

	readFile(file) {
		const reader = new FileReader();
		reader.addEventListener('load', (event) => {
			this.messages.addMessage(`Sending: ${file.name}`, '');
			this.sendFileParts(event.target.result, file.name);
		});
		reader.readAsArrayBuffer(file);
	}

	//////////////////////

	initFileSelector() {
		const fileSelector = document.getElementById('file-selector');
		fileSelector.addEventListener('change', (event) => {
			const fileList = event.target.files;
			this.uploadFileList(fileList);
		});
	}

	initDropArea() {
		const dropArea = document.getElementById('drop-area');

		dropArea.addEventListener('dragover', (event) => {
			event.stopPropagation();
			event.preventDefault();
			// Style the drag-and-drop as a "copy file" operation.
			event.dataTransfer.dropEffect = 'copy';
		});

		dropArea.addEventListener('drop', (event) => {
			event.stopPropagation();
			event.preventDefault();
			const fileList = event.dataTransfer.files;

			this.uploadFileList(fileList);
		});
		this.initPasteArea(dropArea);
	}
}

const dropNPaste = new DropNPaste();
dropNPaste.init();
