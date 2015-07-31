//NOT FINISHED

function CodingArea()
{
	this.root = null;
	this.editor = null;
}

CodingArea.prototype.init = function()
{
	var coding_area = new LiteGUI.Area("codearea",{content_id:""});
	container.appendChild( coding_area.root );
	coding_area.split("horizontal",["50%","calc(50% - 5px)"],true);

	this.root = coding_area;

	var that = this;
	//CODING AREA *********************************
	CodeMirror.commands.autocomplete = function(cm) {
		var API = CodingModule._current_API;
		if(!API)
			CodeMirror.showHint(that.editor, CodeMirror.javascriptHint);
		else
			CodeMirror.showHint(that.editor, CodeMirror.hintAPI );
	}

	CodeMirror.hintAPI = function(editor, options)
	{
		var Pos = CodeMirror.Pos;
		function getToken(e, cur) {return e.getTokenAt(cur);}

		var API = CodingModule._current_API;

		var cur = editor.getCursor(), token = getToken(editor, cur), tprop = token;
		var found = [], start = token.string;

		for(var i in API)
			if( i.indexOf( start ) == 0)
				found.push( i );

		return {
			from: Pos(cur.line, token.start),
			to: Pos(cur.line, token.end),
			list: found 
		};
	}

	CodeMirror.commands.insert_function = function(cm) {
		//trace(cm);
		cm.replaceRange("function() {}",cm.getCursor(),cm.getCursor());
		var newpos = cm.getCursor();
		newpos.ch -= 1; //set cursor inside
		cm.setCursor(newpos);
	}

	CodeMirror.commands.playstop_scene = function(cm) {
		if(window.PlayModule)
			PlayModule.onPlay();
	}		

	CodeMirror.commands.compile = function(cm) {
		CodingModule.evalueCode();
		Scene.refresh();
	}

	//top bar
	var top_widget = this.top_widget = new LiteGUI.Inspector("coding-top-widgets", { one_line: true });
	/*this.top_widget.addButton(null,"Create", { callback: null });*/
	//this.top_widget.addButton(null,"Evaluate", { callback: function() { CodingModule.evalueCode(); }});

	//check for parsing errors
	top_widget.addButton(null,"Compile",{ callback: function(v) { 
		//console.log(CodingModule.area);
		CodingModule.evalueCode();
		Scene.refresh();
	}}).title = "(Ctrl+Enter)";

	top_widget.addButton(null,"Breakpoint",{ callback: function(v) { 
		//console.log(CodingModule.area);
		CodingModule.addBreakPoint();
	}});

	/*
	//execute code
	this.top_widget.addButton(null,"Run",{ callback: function(v) { 
		if( CodingModule._edited_instance && CodingModule._edited_instance.processCode )
			CodingModule._edited_instance.processCode();
	}});
	*/
	
	top_widget.addButton(null,"New Script",{ callback: function(v) { 
		CodingModule.onNewScript();
	}});

	top_widget.addButton(null,"Help",{ callback: function(v) { 
		CodingModule.onShowHelp();
	}});

	//this.top_widget.addSeparator();

	top_widget.addButton(null,"Detach",{ width: 100, callback: function(v) { 
		//console.log(CodingModule.area);
		setTimeout( function() { CodingModule.detachWindow(); },500 );
	}});

	top_widget.addButton(null,"New",{ width: 50, callback: function(v) { 
		CodingModule.createCodingWindow();
	}});

	top_widget.addButton(null,"-",{ width: 40, callback: function(v) { 
		CodingModule.changeFontSize(-1);
	}});
	top_widget.addButton(null,"+",{ width: 40, callback: function(v) { 
		CodingModule.changeFontSize(+1);
	}});

	top_widget.addButton(null,"3D",{ width: 40, callback: function(v) { 
		CodingModule.show3DWindow(!CodingModule.sceneview_visible);
	}});

	/*
	this.top_widget.addString("Search","",{ callback: function(v) { 
		//TODO
	}});
	*/
	//this.top_widget.addButton(null,"Close Editor", { callback: function() { CodingModule.closeTab(); }});
	//this.top_widget.addButton(null,"Execute", { callback: null });

	var coding_workarea_root = coding_area.sections[0];

	var coding_workarea = this.workarea = new LiteGUI.Area("coding-workarea");
	coding_workarea.add( top_widget );
	coding_workarea_root.add( coding_workarea );

	//TODO: this could be improved to use LiteGUI instead
	$(coding_workarea.content).append("<div class='code-container' style='height: calc(100% - 54px); height: -moz-calc(100% - 54px); height: -webkit-calc(100% - 54px); overflow: auto'></div><div id='code-footer' style='height:18px; padding: 4px 0 0 4px; background-color: #222;'></div>");
	var code_container = this.code_container = coding_workarea.query(".code-container");

	var editor = CodeMirror(code_container, {
		value: "",
		mode:  "javascript",
		theme: "blackboard",
		lineWrapping: true,
		gutter: true,
		tabSize: 2,
		lineNumbers: true,
		matchBrackets: true,
		styleActiveLine: true,
		extraKeys: {
			"Ctrl-Enter": "compile",
			"Ctrl-Space": "autocomplete",
			"Cmd-Space": "autocomplete",
			"Ctrl-F": "insert_function",
			"Cmd-F": "insert_function",
			"Ctrl-P": "playstop_scene",
			},
		onCursorActivity: function(e) {
			CodingModule.editor.matchHighlight("CodeMirror-matchhighlight");
		}
	  });

	  editor.on("change", CodingModule.onCodeChange.bind(CodingModule) );

	 this.editor = editor;
}







