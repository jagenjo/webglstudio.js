//***********************************************

var GenericTools = {

	name: "GenericTools",

	init: function()
	{
		LiteGUI.menubar.add("Actions/Tools/scripter", { callback: function() { GenericTools.showScripter(); }});
		LiteGUI.menubar.add("Actions/Screen Capture", { callback: function() { GenericTools.showScreenCapture(); }});
	},

	showScripter: function()
	{
		var dialog = LiteGUI.Dialog.getDialog("scripter_panel");
		if(dialog)
		{
			dialog.maximize();
			dialog.highlight(200);
			return;
		}


		dialog = new LiteGUI.Dialog("scripter_panel", {title:'Scripter', width: 400, height: 600, closable: true, minimize: true, resizable: true, draggable: true });

		dialog.content.style.width = "calc( 100% - 2px )";
		dialog.content.style.height = "calc( 100% - 50px )";
		dialog.content.innerHTML = "<div class='tools'><button class='execute'>Execute</button> <button class='auto-compile'>Auto-compile</button> | Scene <button class='reset'>Restore</button> <button class='update'>Save</button><button class='example' style='float: right'>Example</button></div><textarea class='code' style='height:calc(100% - 40px); height:-webkit-calc(100% - 40px);'></textarea>";
		var textarea = $(dialog.content).find("textarea");
		var old_code = localStorage.getItem("wglstudio-scripter-code");
		if(!old_code)
			old_code = "if($1)\n   $1.transform.rotateY(10);";
		textarea[0].style.width = "calc( 100% - 2px )";
		textarea[0].style.height = "calc( 100% - 2px )";
		textarea.val( old_code );
		this.textarea = textarea;

		var first_time = true;
		var backup = LS.GlobalScene.serialize();

		textarea.bind("keydown",function(e) {
			var keyCode = e.keyCode || e.which;

			if(keyCode == 9) //tab
			{
				e.preventDefault();
				var start = $(this).get(0).selectionStart;
				var end = $(this).get(0).selectionEnd;

				// set textarea value to: text before caret + tab + text after caret
				$(this).val($(this).val().substring(0, start)
							+ "\t"
							+ $(this).val().substring(end));

				// put caret at right position again
				$(this).get(0).selectionStart =
				$(this).get(0).selectionEnd = start + 1;
				return false;
			}
			else if (keyCode == 13 && e.ctrlKey)
			{
				$(dialog.content).find("button.compile").click();
			}
		});

		$(dialog.content).find("button.update").click(function() {
			backup = LS.GlobalScene.serialize();
		});

		$(dialog.content).find("button.reset").click(function() {
			var id = null;
			if(LS.GlobalScene.selected_node)
				id = LS.GlobalScene.selected_node.id;
			LS.GlobalScene.clear();
			LS.GlobalScene.configure( backup );
			if(id != null)
				LS.GlobalScene.selected_node = LS.GlobalScene.getNode( id );
			RenderModule.requestFrame();
		});

		$(dialog.content).find("button.execute").click(function() {
			UndoModule.saveSceneUndo();
			GenericTools.compileCode();
		});

		$(dialog.content).find("button.auto-compile").click(function() {
			if( $(this).hasClass("enabled") )
			{
				$(this).removeClass("enabled");
				clearInterval( GenericTools._autocompile_timer  );
				GenericTools._autocompile_timer = null;
			}
			else
			{
				$(this).addClass("enabled");
				UndoModule.saveSceneUndo();
				GenericTools._autocompile_timer = setInterval(function() {
					GenericTools.compileCode();
					if(LS.GlobalScene.nodes.length > 200)
						$("button.auto-compile").click(); //fail safe
				}, 1000/60);
			}
		});

		$(dialog.content).find("button.example").click(function() {
			var example = "var node = $1; //$1 contains the selected node\nif(!node) return LiteGUI.alert('select a node');\nfor(var i = 0; i < 50; i++)\n{\n	var newnode = node.clone();\n	newnode.transform.translate( [ Math.random() * 500, 0, Math.random()*-500]);\n	LS.GlobalScene.root.addChild(newnode);\n}\n";
			textarea.val(example);
		});

		dialog.show();
	},

	compileCode: function()
	{
		var code = this.textarea.val();
		localStorage.setItem("wglstudio-scripter-code",code);
		code =  "var $1 = LS.GlobalScene.selected_node;\n" + code;

		try
		{
			eval( "GenericTools._compiled_func = function() {" + code + ";\n};");
			GenericTools._compiled_func();
			RenderModule.requestFrame();
		}
		catch (err)
		{
			//trace(err);
			//LiteGUI.alert("Error: " + err);
			return;
		}

		//save the good ones
		if(this._compiled_func)
			this._last_valid_func = this._compiled_func;
	},

	showScreenCapture: function()
	{
		var dialog = LiteGUI.Dialog.getDialog("screencapture_panel");
		if(dialog)
		{
			dialog.maximize();
			dialog.highlight(200);
			return;
		}

		dialog = new LiteGUI.Dialog("screencapture_panel", {title:'Screen Capture', fullcontent:true, width: 800, height: 400, closable: true, minimize: true, resizable: true, draggable: true });

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
				var img_blob = RenderModule.takeScreenshot( width_widget.getValue(), height_widget.getValue(), true );
				var url = URL.createObjectURL( img_blob );

				var img = new Image();
				img.setAttribute("download","screen.png");
				img.src = url;
				info_widget.setValue("<a href='"+url+"' download='screenshot.png'>Download File</a>");
				//img.width = "100%";
				captureArea.innerHTML = ""
				captureArea.appendChild( img );
		});
		var info_widget = inspector.addInfo(null,"Click capture");

		area.getSection(0).add( inspector );

		var captureArea = area.getSection(1).content;
		captureArea.style.backgroundColor = "black";
		captureArea.style.overflow = "auto";

		dialog.show();
	}
};

CORE.registerModule( GenericTools );