var Capture = {

	name: "Capture",
	preferences: {
		quality: "medium",
		framerate: 30,
		use_rendering_framerate: true
	},

	media_options:
	{
		"high":	{
			mimeType: "video/webm; codecs=vp9", 
			videoBitsPerSecond : 50000000,
		},

		"medium": {
			mimeType: "video/webm; codecs=vp9", 
			videoBitsPerSecond : 25000000,
		},

		"low": {
			mimeType: "video/webm; codecs=vp9", 
			videoBitsPerSecond : 2500000,
		},
	},

	init: function()
	{
		LiteGUI.menubar.add("Window/Image capture", { callback: function() { Capture.showImageCaptureDialog(); }});
		LiteGUI.menubar.add("Window/Video capture", { callback: function() { Capture.showVideoCaptureDialog(); }});

		LiteGUI.addCSS("\n\
			.record-tools { position: absolute; top: 0px; left: 50%; background-color: #111; border-radius: 0 0 10px 10px; }\n\
			.record-tools.recording { background-color: #422; } \n\
			.record-tools .record { background-color: transparent; display: inline-block; color: #f00; font-size: 3em; transform: translate(0,2px); }\n\
			.record-tools .time { display: inline-block; transform: translate(0,-2px); text-align: center; width: 100px; color: #aaa; font-size: 1.4em; }\n\
			.record-tools.recording .time { color: #fff; } \n\
			.record-tools .settings { background-color: transparent; display: inline-block; transform: translate(0,2px); }\n\
		");

		//this.showVideoCaptureDialog();

	},

	startRecording: function( framerate, media_options )
	{
		media_options = media_options || {
			mimeType: "video/webm; codecs=vp9", 
			videoBitsPerSecond : 25000000,
		};

		//get video
		var stream = this._stream = gl.canvas.captureStream( framerate );
		
		//to get audio
		//stream.addTrack( audio_stream );

		var recordedChunks = this._recordedChunks = [];

		var mediaRecorder = this._mediaRecorder = new MediaRecorder( this._stream, media_options );

		mediaRecorder.ondataavailable = handleDataAvailable;
		mediaRecorder.start();
		console.log("Recording Video at", mediaRecorder.videoBitsPerSecond, "bits per second" );

		if(this.videocapture_container)
			this.videocapture_container.classList.add("recording");

		function handleDataAvailable(event) {
		  if (event.data.size > 0)
			recordedChunks.push(event.data);
			var blob = new Blob( recordedChunks, {
				type: "video/webm"
			});
			var url = URL.createObjectURL(blob);
			var a = document.createElement("a");
			document.body.appendChild(a);
			a.style = "display: none";
			a.href = url;
			a.download = "capture.webm";
			a.click();
			window.URL.revokeObjectURL(url);

			Capture._mediaRecorder = null;
			Capture._recordedChunks = [];
		}

		this.is_recording = true;
		this.recording_start_time = getTime();
		this._interval = setInterval(function(){
			if( !Capture.videocapture_container )
				return;
			var time = Math.floor((getTime() - Capture.recording_start_time) * 0.001);
			var minutes = Math.floor( time / 60 );
			var seconds = time % 60;
			Capture.videocapture_container.querySelector(".time").innerHTML = minutes + ":" + (seconds < 10 ? "0":"") + seconds;
		},1000);
	},

	stopRecording: function()
	{
		this._mediaRecorder.stop();
		this.is_recording = false;
		clearInterval( this._interval );
		if(this.videocapture_container)
		{
			this.videocapture_container.classList.remove("recording");
			this.videocapture_container.querySelector(".time").innerHTML = "0:00";
		}
	},

	showVideoCaptureDialog: function()
	{
		if( this.videocapture_container )
		{
			this.videocapture_container.style.display = this.videocapture_container.style.display == "none" ? "" : "none";
			return;
		}
			
		var container = this.videocapture_container = document.createElement("div");
		container.innerHTML = "<div class='tool-button record'>&#9679;</div><span class='time'>0:00</span><div class='tool-button settings' style='display: inline-block;'><img src='imgs/mini-cog.png'></div>";
		container.className = 'record-tools';
		document.querySelector("#visor").appendChild(container);

		var record_button = container.querySelector('.record');
		record_button.addEventListener('mousedown', function(e){
			e.preventDefault();
			if(Capture.is_recording)
			{
				this.innerHTML = "&#9679;";//record
				this.style.color = "#F00";
				Capture.stopRecording();
			}
			else
			{
				this.innerHTML = "&#9632;";//stop
				this.style.color = "#FFF";

				var media_options = Capture.media_options[ Capture.preferences.quality ]
				Capture.startRecording( Capture.preferences.use_rendering_framerate ? undefined : Capture.preferences.framerate, media_options );
			}
		});

		container.querySelector('.settings').addEventListener("mousedown", this.showCaptureSettingsDialog.bind(this) );
	},

	showCaptureSettingsDialog: function()
	{
		var dialog = new LiteGUI.Dialog({ title:'Video Capture', fullcontent:true, width: 300, height: 300, closable: true, minimize: true, resizable: true, draggable: true });
		var inspector = new LiteGUI.Inspector({ name_width: 150 });
		dialog.add(inspector);
		var preferences = this.preferences;

		inspector.addCombo("Quality", preferences.quality, { values: ["high","medium","low"], callback: function(v){ preferences.quality = v; }});
		inspector.addNumber("Framerate", preferences.framerate, { step:1, min:0, max:90, callback: function(v){ preferences.framerate = v; }});
		inspector.addCheckbox("Use Rendering Framerate", preferences.use_rendering_framerate, { callback: function(v){ preferences.use_rendering_framerate = v; }});
		
		dialog.show();
		dialog.adjustSize();
	},

	showImageCaptureDialog: function()
	{
		var dialog = LiteGUI.Dialog.getDialog("screencapture_panel");
		if(dialog)
		{
			dialog.maximize();
			dialog.highlight(200);
			return;
		}

		dialog = new LiteGUI.Dialog({ title:'Screen Capture', fullcontent:true, width: 800, height: 400, closable: true, minimize: true, resizable: true, draggable: true });

		var area = new LiteGUI.Area(null,{ size: "100%" });
		dialog.add(area);
		area.split("horizontal",[200,null]);
		area.root.style.height = "calc( 100% - 20px )";

		var inspector = new LiteGUI.Inspector();
		inspector.addTitle("Image Size");
		inspector.addCombo("Size","Canvas", { values: ["Canvas","1/2","1/4","2","4","512x512","Custom"], callback: function(v){
			var width = gl.canvas.width;
			var height = gl.canvas.height;
			if(v == "1/2")
			{
				width = (width * 0.5)|0;
				height = (height * 0.5)|0;
			}
			else if(v == "1/4")
			{
				width = (width * 0.25)|0;
				height = (height * 0.25)|0;
			}
			else if(v == "2")
			{
				width = (width * 2)|0;
				height = (height * 2)|0;
			}
			else if(v == "4")
			{
				width = (width * 4)|0;
				height = (height * 4)|0;
			}
			else if(v == "512x512")
			{
				width = height = 512;
			}
			else if(v == "Custom")
			{
			}
			width_widget.setValue(width);
			height_widget.setValue(height);
		}});
		var width_widget = inspector.addNumber("Width", gl.canvas.width, { min:64,step:1 });
		var height_widget = inspector.addNumber("Height", gl.canvas.height, { min:64,step:1 });

		inspector.addTitle("Shadowmaps");
		inspector.addCombo("Shadowmap Resolution", RenderModule.render_settings.default_shadowmap_resolution , { values:[ 256,512,1024,2048,4096], callback: function(v){
			RenderModule.render_settings.default_shadowmap_resolution = v;
		}});
		inspector.addButton(null,"set all shadowmaps size to default", function(){
			var lights = LS.GlobalScene._lights;
			for(var i in lights)
				lights[i].shadowmap_resolution = 0; //default
		});

		inspector.addTitle("Results");
		inspector.addButton(null,"Capture", function(){
			RenderModule.takeScreenshot( width_widget.getValue(), height_widget.getValue(), inner_screenshot );
		});
		var info_widget = inspector.addInfo(null,"Click capture");

		area.getSection(0).add( inspector );

		var captureArea = area.getSection(1).content;
		captureArea.style.backgroundColor = "black";
		captureArea.style.overflow = "auto";

		dialog.show();

		function inner_screenshot( img_blob )
		{
			var url = URL.createObjectURL( img_blob );

			var img = new Image();
			img.setAttribute("download","screen.png");
			img.src = url;
			info_widget.setValue("<a href='"+url+"' download='screenshot.png'>Download File</a>");
			//img.width = "100%";
			captureArea.innerHTML = ""
			captureArea.appendChild( img );
		}
	}
};

CORE.registerModule( Capture );
	
