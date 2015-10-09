//packer version

/**
* Core namespace of LiteGUI library, it holds some useful functions
*
* @class LiteGUI
* @constructor
*/


var LiteGUI = {
	root: null,
	content: null,

	panels: {},

	//undo
	undo_steps: [],

	//used for blacken when a modal dialog is shown
	modalbg_div: null,

	//the top menu
	mainmenu: null,

	/**
	* initializes the lib, must be called
	* @method init
	* @param {object} options some options are container, menubar, 
	*/
	init: function(options)
	{
		options = options || {};

		if(options.width && options.height)
			this.setWindowSize(options.width,options.height);

		//choose main container
		this.container = null;
		if( options.container )
			this.container = document.getElementById(options.container);
		if(!this.container )
			this.container = document.body;

		//create litegui root element
		var root = document.createElement("div");
		root.className = "litegui-wrap fullscreen";
		root.style.position = "relative";
		root.style.overflow = "hidden";
		this.root = root;
		this.container.appendChild( root );

		//create modal dialogs container
		var modalbg = this.modalbg_div = document.createElement("div");
		this.modalbg_div.className = "litemodalbg";
		this.root.appendChild(this.modalbg_div);
		modalbg.style.display = "none";

		//content: the main container for everything
		var content = document.createElement("div");
		content.className = "litegui-maincontent";
		this.content = content;
		this.root.appendChild(content);

		//create menubar
		if(options.menubar)
			this.createMenubar();

		//called before anything
		if(options.gui_callback)
			options.gui_callback();

		//maximize
		if( this.root.classList.contains("fullscreen") )
		{
			window.addEventListener("resize", function(e) { 
				LiteGUI.maximizeWindow();
			});
		}
	},

	/**
	* Triggers a simple event in an object (similar to jQuery.trigger)
	* @method trigger
	* @param {Object} element could be an HTMLEntity or a regular object
	* @param {Object} element could be an HTMLEntity or a regular object
	* @param {Object} element could be an HTMLEntity or a regular object
	*/
	trigger: function(element, event_name, params)
	{
		var evt = document.createEvent( 'CustomEvent' );
		evt.initCustomEvent( event_name, true,true, params ); //canBubble, cancelable, detail
		if( element.dispatchEvent )
			element.dispatchEvent( evt );
		else if( element.__events )
			element.__events.dispatchEvent( evt );
		//else nothing seems binded here so nothing to do
		return evt;
	},

	/**
	* Binds an event in an object (similar to jQuery.bind)
	* If the element is not an HTML entity a new one is created, attached to the object (as non-enumerable, called __events) and used
	* @method trigger
	* @param {Object} element could be an HTMLEntity or a regular object
	* @param {String} event the string defining the event
	* @param {Function} callback where to call
	*/
	bind: function( element, event, callback )
	{
		if(element.addEventListener)
			element.addEventListener(event, callback);
		else if(element.__events)
			element.__events.addEventListener( event, callback );
		else
		{
			//create a dummy HTMLentity so we can use it to bind HTML events
			var dummy = document.createElement("span");
			Object.defineProperty( element, "__events", {
				enumerable: false,
				configurable: false,
				writable: false,
				value: dummy
			});
			element.__events.addEventListener( event, callback );
		}
	},

	/**
	* Unbinds an event in an object (similar to jQuery.unbind)
	* @method unbind
	* @param {Object} element could be an HTMLEntity or a regular object
	* @param {String} event the string defining the event
	* @param {Function} callback where to call
	*/
	unbind: function(element, event, callback)
	{
		if( element.removeEventListener )
			element.removeEventListener( event, callback );
		else if( element.__events && element.__events.removeEventListener )
			element.__events.removeEventListener( event, callback );
	},

	/**
	* Appends litegui widget to the global interface
	* @method add
	* @param {Object} litegui_element
	*/
	add: function( litegui_element )
	{
		this.content.appendChild( litegui_element.root || litegui_element );
	},

	/**
	* Remove from the interface, it is is an HTML element it is removed from its parent, if it is a widget the same.
	* @method remove
	* @param {Object} litegui_element it also supports HTMLentity or selector string
	*/
	remove: function( element )
	{
		if(element && element.constructor === String) //selector
		{
			var elements = document.querySelectorAll( element );
			for(var i = 0; i < elements.length; ++i)
			{
				var element = elements[i];
				if(element && element.parentNode)
					element.parentNode.removeChild(element);
			}
		}
		else if( element.root && element.root.parentNode ) //ltiegui widget
			element.root.parentNode.removeChild( element.root );
		else if( element.parentNode ) //regular HTML entity
			element.parentNode.removeChild( element );
	},

	/**
	* wrapper of document.getElementById
	* @method getById
	* @param {String} id
	* return {HTMLEntity}
	**/
	getById: function(id)
	{
		return document.getElementById(id);
	},

	createMenubar: function()
	{
		this.menubar = new LiteGUI.Menubar("mainmenubar");
		this.add( this.menubar );
	},

	setWindowSize: function(w,h)
	{
		if(w && h)
		{
			$(this.root).css( {width: w+"px", height: h + "px", "box-shadow":"0 0 4px black"}).removeClass("fullscreen");

		}
		else
		{
			if( $(this.root).hasClass("fullscreen") )
				return;
			$(this.root).addClass("fullscreen");
			$(this.root).css( {width: "100%", height: "100%", "box-shadow":"0 0 0"});
		}
		$(LiteGUI).trigger("resized");
	},

	maximizeWindow: function()
	{
		this.setWindowSize();
	},

	/**
	* Change cursor
	* @method setCursor
	* @param {String} cursor
	**/
	setCursor: function( name )
	{
		this.root.style.cursor = name;
	},

	/**
	* Copy a string to the clipboard (it needs to be invoqued from a click event)
	* @method toClipboard
	* @param {String} data
	**/
	toClipboard: function( object )
	{
		if(object && object.constructor !== String )
			object = JSON.stringify( object );

		var input = null;
		var in_clipboard = false;
		try
		{
			var copySupported = document.queryCommandSupported('copy');
			input = document.createElement("input");
			input.type = "text";
			input.style.opacity = 0;
			input.value = object;
			document.body.appendChild( input );
			input.select();
			in_clipboard = document.execCommand('copy');
			console.log( in_clipboard ? "saved to clipboard" : "problem saving to clipboard");
			document.body.removeChild( input );
		} catch (err) {
			if(input)
				document.body.removeChild( input );
			console.log('Oops, unable to copy using the true clipboard');
		}

		//old system
		localStorage.setItem("litegui_clipboard", object );
	},

	/**
	* Reads from the secondary clipboard (only can read if the data was stored using the toClipboard)
	* @method getClipboard
	* @return {String} clipboard
	**/
	getClipboard: function()
	{
		var data = localStorage.getItem("litegui_clipboard");
		if(!data) 
			return null;
		if(data[0] == "{")
			return JSON.parse( data );
		return data;
	},

	/**
	* Insert some CSS code to the website
	* @method addCSS
	* @param {String|Object} code it could be a string with CSS rules, or an object with the style syntax.
	**/
	addCSS: function(code)
	{
		if(!code)
			return;

		if(code.constructor === String)
		{
			var style = document.createElement('style');
			style.type = 'text/css';
			style.innerHTML = code;
			document.getElementsByTagName('head')[0].appendChild(style);
			return;
		}
		else
		{
			for(var i in code)
			document.body.style[i] = code[i];
		}
	},

	/**
	* Requires a new CSS
	* @method requireCSS
	* @param {String} url string with url or an array with several urls
	* @param {Function} on_complete
	**/
	requireCSS: function(url, on_complete)
	{
		if(typeof(url)=="string")
			url = [url];

		while(url.length)
		{
			var link  = document.createElement('link');
			//link.id   = cssId;
			link.rel  = 'stylesheet';
			link.type = 'text/css';
			link.href = url.shift(1);
			link.media = 'all';
			var head = document.getElementsByTagName('head')[0];
			head.appendChild(link);
			if(url.length == 0)
				link.onload = on_complete;
		}
	},

	/**
	* Request file from url (it could be a binary, text, etc.). If you want a simplied version use 
	* @method request
	* @param {Object} request object with all the parameters like data (for sending forms), dataType, success, error
	* @param {Function} on_complete
	**/
	request: function(request)
	{
		var dataType = request.dataType || "text";
		if(dataType == "json") //parse it locally
			dataType = "text";
		else if(dataType == "xml") //parse it locally
			dataType = "text";
		else if (dataType == "binary")
		{
			//request.mimeType = "text/plain; charset=x-user-defined";
			dataType = "arraybuffer";
			request.mimeType = "application/octet-stream";
		}	

		//regular case, use AJAX call
        var xhr = new XMLHttpRequest();
        xhr.open(request.data ? 'POST' : 'GET', request.url, true);
        if(dataType)
            xhr.responseType = dataType;
        if (request.mimeType)
            xhr.overrideMimeType( request.mimeType );
        xhr.onload = function(load)
		{
			var response = this.response;
			if(this.status != 200)
			{
				var err = "Error " + this.status;
				if(request.error)
					request.error(err);
				LEvent.trigger(xhr,"fail", this.status);
				return;
			}

			if(request.dataType == "json") //chrome doesnt support json format
			{
				try
				{
					response = JSON.parse(response);
				}
				catch (err)
				{
					if(request.error)
						request.error(err);
					else
						throw err;
				}
			}
			else if(request.dataType == "xml")
			{
				try
				{
					var xmlparser = new DOMParser();
					response = xmlparser.parseFromString(response,"text/xml");
				}
				catch (err)
				{
					if(request.error)
						request.error(err);
					else
						throw err;
				}
			}
			if(request.success)
				request.success.call(this, response, this);
		};
        xhr.onerror = function(err) {
			if(request.error)
				request.error(err);
		}
        xhr.send(request.data);
		return xhr;
	},	

	/**
	* Request file from url
	* @method requestText
	* @param {String} url
	* @param {Function} on_complete
	* @param {Function} on_error
	**/
	requestText: function(url, on_complete, on_error )
	{
		return this.request({ url: url, dataType:"text", success: on_complete, error: on_error });
	},

	/**
	* Request file from url
	* @method requestJSON
	* @param {String} url
	* @param {Function} on_complete
	* @param {Function} on_error
	**/
	requestJSON: function(url, on_complete, on_error )
	{
		return this.request({ url: url, dataType:"json", success: on_complete, error: on_error });
	},

	/**
	* Request binary file from url
	* @method requestBinary
	* @param {String} url
	* @param {Function} on_complete
	* @param {Function} on_error
	**/
	requestBinary: function(url, on_complete, on_error )
	{
		return this.request({ url: url, dataType:"binary", success: on_complete, error: on_error });
	},
	
	
	/**
	* Request script and inserts it in the DOM
	* @method requireScript
	* @param {String} url
	* @param {Function} on_complete
	* @param {Function} on_error
	* @param {Function} on_progress (if several files are required, on_progress is called after every file is added to the DOM)
	**/
	requireScript: function(url, on_complete, on_error, on_progress )
	{
		if(typeof(url)=="string")
			url = [url];

		var total = url.length;
		var size = total;
		for(var i in url)
		{
			var script = document.createElement('script');
			script.num = i;
			script.type = 'text/javascript';
			script.src = url[i];
			script.async = false;
			script.onload = function(e) { 
				total--;
				if(total)
				{
					if(on_progress)
						on_progress(this.src, this.num);
				}
				else if(on_complete)
					on_complete();
			};
			if(on_error)
				script.onerror = function(err) { 
					on_error(err, this.src, this.num );
				}
			document.getElementsByTagName('head')[0].appendChild(script);
		}
	},


	//old version, it loads one by one, so it is slower
	requireScriptSerial: function(url, on_complete, on_progress )
	{
		if(typeof(url)=="string")
			url = [url];

		function addScript()
		{
			var script = document.createElement('script');
			script.type = 'text/javascript';
			script.src = url.shift(1);
			script.onload = function(e) { 
				if(url.length)
				{
					if(on_progress)
						on_progress(url[0], url.length);

					addScript();
					return;
				}
				
				if(on_complete)
					on_complete();
			};
			document.getElementsByTagName('head')[0].appendChild(script);
		}

		addScript();
	},

	newDiv: function(id, code)
	{
		return this.createElement("div",id,code);
	},

	/**
	* Request script and inserts it in the DOM
	* @method createElement
	* @param {String} tag
	* @param {String} id
	* @param {String} content
	* @param {Object} style
	**/
	createElement: function(tag, id, content, style)
	{
		var elem = document.createElement( tag );
		if(id)
			elem.id = id;
		elem.root = elem;
		if(content)
			elem.innerHTML = content;
		elem.add = function(v) { this.appendChild( v.root || v ); };

		if(style)
			for(var i in style)
				elem.style[i] = style[i];
		return elem;
	},

	/**
	* Request script and inserts it in the DOM
	* @method createButton
	* @param {String} id
	* @param {String} content
	* @param {Function} callback when the button is pressed
	**/
	createButton: function( id, content, callback )
	{
		var elem = document.createElement("button");
		elem.id = id;
		elem.root = elem;
		if(content !== undefined)
			elem.innerHTML = content;
		if(callback)
			elem.addEventListener("click", callback );
		return elem;
	},

	//used to create a window that retains all the CSS info or the scripts.
	newWindow: function(title, width, height, options)
	{
		options = options || {};
		var new_window = window.open("","","width="+width+", height="+height+", location=no, status=no, menubar=no, titlebar=no, fullscreen=yes");
		new_window.document.write( "<html><head><title>"+title+"</title>" );

		//transfer style
		var styles = document.querySelectorAll("link[rel='stylesheet'],style");
		for(var i = 0; i < styles.length; i++)
			new_window.document.write( styles[i].outerHTML );

		//transfer scripts (optional because it can produce some errors)
		if(options.scripts)
		{
			var scripts = document.querySelectorAll("script");
			for(var i = 0; i < scripts.length; i++)
			{
				if(scripts[i].src) //avoid inline scripts, otherwise a cloned website would be created
					new_window.document.write( scripts[i].outerHTML );
			}
		}


		var content = options.content || "";
		new_window.document.write( "</head><body>"+content+"</body></html>" );
		new_window.document.close();
		return new_window;
	},

	//* DIALOGS *******************
	showModalBackground: function(v)
	{
		LiteGUI.modalbg_div.style.display = v ? "block" : "none";
	},

	showMessage: function(content, options)
	{
		options = options || {};
		
		options.title = options.title || "Attention";
		options.content = content;
		options.close = 'fade';
		var dialog = new LiteGUI.Dialog("info_message",options);
		if(!options.noclose)
			dialog.addButton("Close",{ close: true });
		dialog.makeModal('fade');
		return dialog;
	},

	/**
	* Shows a dialog with a message
	* @method popup
	* @param {String} content
	* @param {Object} options ( min_height, content, noclose )
	**/
	popup: function( content, options )
	{
		options = options || {};

		options.min_height = 140;
		if (typeof(content) == "string")
			content = "<p>" + content + "</p>";

		options.content = content;
		options.close = 'fade';

		var dialog = new LiteGUI.Dialog("info_message",options);
		if(!options.noclose)
			dialog.addButton("Close",{ close: true });
		dialog.show();
		return dialog;
	},


	/**
	* Shows an alert dialog with a message
	* @method alert
	* @param {String} content
	* @param {Object} options ( title, width, height, content, noclose )
	**/
	alert: function( content, options )
	{
		options = options || {};

		options.className = "alert";
		options.title = "Alert";
		options.width = 280;
		options.height = 140;
		if (typeof(content) == "string")
			content = "<p>" + content + "</p>";
		$(".litepanel.alert").remove(); //kill other panels
		return this.showMessage(content,options);
	},

	/**
	* Shows a confirm dialog with a message
	* @method confirm
	* @param {String} content
	* @param {Function} callback
	* @param {Object} options ( title, width, height, content, noclose )
	**/
	confirm: function(content, callback, options)
	{
		options = options || {};
		options.className = "alert";
		options.title = "Confirm";
		options.width = 280;
		//options.height = 100;
		if (typeof(content) == "string")
			content = "<p>" + content + "</p>";

		content +="<button data-value='yes' style='width:45%; margin-left: 10px'>Yes</button><button data-value='no' style='width:45%'>No</button>";
		options.noclose = true;

		var dialog = this.showMessage(content,options);
		dialog.content.style.paddingBottom = "10px";
		var buttons = dialog.content.querySelectorAll("button");
		for(var i = 0; i < buttons.length; i++)
			buttons[i].addEventListener("click", inner);

		function inner(v) {
			var v = this.dataset["value"] == "yes";
			if(callback) 
				callback(v);
			dialog.close();
		}

		return dialog;
	},

	/**
	* Shows a prompt dialog with a message
	* @method prompt
	* @param {String} content
	* @param {Function} callback
	* @param {Object} options ( title, width, height, content, noclose )
	**/
	prompt: function( content, callback, options )
	{
		options = options || {};
		options.className = "alert";
		options.title = "Prompt" || options.title;
		options.width = 280;
		//options.height = 140 + (options.textarea ? 40 : 0);
		if (typeof(content) == "string")
			content = "<p>" + content + "</p>";

		var value = options.value || "";
		var textinput = "<input type='text' value='"+value+"'/>";
		if (options.textarea)
			textinput = "<textarea class='textfield' style='width:95%'>"+value+"</textarea>";

		content +="<p>"+textinput+"</p><button data-value='accept' style='width:45%; margin-left: 10px; margin-bottom: 10px'>Accept</button><button data-value='cancel' style='width:45%'>Cancel</button>";
		options.noclose = true;
		var dialog = this.showMessage(content,options);

		var buttons = dialog.content.querySelectorAll("button");
		for(var i = 0; i < buttons.length; i++)
			buttons[i].addEventListener("click", inner);

		function inner() {
			var value = dialog.content.querySelector("input,textarea").value;
			if(this.dataset["value"] == "cancel")
				value = null;

			if(callback)
				callback( value );
			dialog.close();
		};

		var elem = dialog.content.querySelector("input,textarea");
		elem.focus();

		return dialog;
	},

	/**
	* Returns the URL vars ( ?foo=faa&foo2=etc )
	* @method getUrlVars
	**/
	getUrlVars: function(){
		var vars = [], hash;
		var hashes = window.location.href.slice(window.location.href.indexOf('?') + 1).split('&');
		for(var i = 0; i < hashes.length; i++)
		{
		  hash = hashes[i].split('=');
		  vars.push(hash[0]);
		  vars[hash[0]] = hash[1];
		}
		return vars;
	},

	getUrlVar: function(name) {
		return LiteGUI.getUrlVars()[name];
	},

	focus: function( element )
	{
		element.focus();
	},

	/**
	* Makes one element draggable
	* @method draggable
	* @param {HTMLEntity} container the element that will be dragged
	* @param {HTMLEntity} dragger the area to start the dragging
	**/
	draggable: function(container, dragger)
	{
		dragger = dragger || container;
		dragger.addEventListener("mousedown", inner_mouse);
		dragger.style.cursor = "move";
		var prev_x = 0;
		var prev_y = 0;

		var rect = container.getClientRects()[0];
		var x = rect ? rect.left : 0;
		var y = rect ? rect.top : 0;

		container.style.position = "absolute";
		container.style.left = x + "px";
		container.style.top = y + "px";

		function inner_mouse(e)
		{
			if(e.type == "mousedown")
			{
				if(!rect)
				{
					rect = container.getClientRects()[0];
					x = rect ? rect.left : 0;
					y = rect ? rect.top : 0;
				}

				prev_x = e.clientX;
				prev_y = e.clientY;
				document.addEventListener("mousemove",inner_mouse);
				document.addEventListener("mouseup",inner_mouse);
				e.stopPropagation();
				e.preventDefault();
				return false;
			}

			if(e.type == "mouseup")
			{
				document.removeEventListener("mousemove",inner_mouse);
				document.removeEventListener("mouseup",inner_mouse);
				return;
			}

			if(e.type == "mousemove")
			{
				var deltax = e.clientX - prev_x;
				var deltay = e.clientY - prev_y;
				prev_x = e.clientX;
				prev_y = e.clientY;
				x += deltax;
				y += deltay;
				container.style.left = x + "px";
				container.style.top = y + "px";
			}
		}
	},

	/**
	* Clones object content
	* @method cloneObject
	* @param {Object} object
	* @param {Object} target
	**/
	cloneObject: function(object, target)
	{
		var o = target || {};
		for(var i in object)
		{
			if(i[0] == "_" || i.substr(0,6) == "jQuery") //skip vars with _ (they are private)
				continue;

			var v = object[i];
			if(v == null)
				o[i] = null;			
			else if ( isFunction(v) )
				continue;
			else if (typeof(v) == "number" || typeof(v) == "string")
				o[i] = v;
			else if( v.constructor == Float32Array ) //typed arrays are ugly when serialized
				o[i] = Array.apply( [], v ); //clone
			else if ( isArray(v) )
			{
				if( o[i] && o[i].constructor == Float32Array ) //reuse old container
					o[i].set(v);
				else
					o[i] = JSON.parse( JSON.stringify(v) ); //v.slice(0); //not safe using slice because it doesnt clone content, only container
			}
			else //slow but safe
			{
				try
				{
					//prevent circular recursions
					o[i] = JSON.parse( JSON.stringify(v) );
				}
				catch (err)
				{
					console.error(err);
				}
			}
		}
		return o;
	},

	special_codes: {
		close: "&#10005;"
	}
};


function purgeElement(d, skip) {
    var a = d.attributes, i, l, n;

    if (a) {
        for (i = a.length - 1; i >= 0; i -= 1) {
            n = a[i].name;
            if (typeof d[n] === 'function') {
                d[n] = null;
            }
        }
    }

    a = d.childNodes;
    if (a) {
        l = a.length;
        for (i = 0; i < l; i += 1) {
            purgeElement(d.childNodes[i]);
        }
    }

	/*
	if(!skip)
	{
		for (i in d) {
			if (typeof d[i] === 'function') {
				d[i] = null;
			}
		}
	}
	*/
}

//useful functions

//from stackoverflow http://stackoverflow.com/questions/1354064/how-to-convert-characters-to-html-entities-using-plain-javascript

if(typeof escapeHtmlEntities == 'undefined') {
        escapeHtmlEntities = function (text) {
            return text.replace(/[\u00A0-\u2666<>\&]/g, function(c) {
                return '&' + 
                (escapeHtmlEntities.entityTable[c.charCodeAt(0)] || '#'+c.charCodeAt(0)) + ';';
            });
        };

        // all HTML4 entities as defined here: http://www.w3.org/TR/html4/sgml/entities.html
        // added: amp, lt, gt, quot and apos
        escapeHtmlEntities.entityTable = {
            34 : 'quot', 
            38 : 'amp', 
            39 : 'apos', 
            60 : 'lt', 
            62 : 'gt', 
            160 : 'nbsp', 
            161 : 'iexcl', 
            162 : 'cent', 
            163 : 'pound', 
            164 : 'curren', 
            165 : 'yen', 
            166 : 'brvbar', 
            167 : 'sect', 
            168 : 'uml', 
            169 : 'copy', 
            170 : 'ordf', 
            171 : 'laquo', 
            172 : 'not', 
            173 : 'shy', 
            174 : 'reg', 
            175 : 'macr', 
            176 : 'deg', 
            177 : 'plusmn', 
            178 : 'sup2', 
            179 : 'sup3', 
            180 : 'acute', 
            181 : 'micro', 
            182 : 'para', 
            183 : 'middot', 
            184 : 'cedil', 
            185 : 'sup1', 
            186 : 'ordm', 
            187 : 'raquo', 
            188 : 'frac14', 
            189 : 'frac12', 
            190 : 'frac34', 
            191 : 'iquest', 
            192 : 'Agrave', 
            193 : 'Aacute', 
            194 : 'Acirc', 
            195 : 'Atilde', 
            196 : 'Auml', 
            197 : 'Aring', 
            198 : 'AElig', 
            199 : 'Ccedil', 
            200 : 'Egrave', 
            201 : 'Eacute', 
            202 : 'Ecirc', 
            203 : 'Euml', 
            204 : 'Igrave', 
            205 : 'Iacute', 
            206 : 'Icirc', 
            207 : 'Iuml', 
            208 : 'ETH', 
            209 : 'Ntilde', 
            210 : 'Ograve', 
            211 : 'Oacute', 
            212 : 'Ocirc', 
            213 : 'Otilde', 
            214 : 'Ouml', 
            215 : 'times', 
            216 : 'Oslash', 
            217 : 'Ugrave', 
            218 : 'Uacute', 
            219 : 'Ucirc', 
            220 : 'Uuml', 
            221 : 'Yacute', 
            222 : 'THORN', 
            223 : 'szlig', 
            224 : 'agrave', 
            225 : 'aacute', 
            226 : 'acirc', 
            227 : 'atilde', 
            228 : 'auml', 
            229 : 'aring', 
            230 : 'aelig', 
            231 : 'ccedil', 
            232 : 'egrave', 
            233 : 'eacute', 
            234 : 'ecirc', 
            235 : 'euml', 
            236 : 'igrave', 
            237 : 'iacute', 
            238 : 'icirc', 
            239 : 'iuml', 
            240 : 'eth', 
            241 : 'ntilde', 
            242 : 'ograve', 
            243 : 'oacute', 
            244 : 'ocirc', 
            245 : 'otilde', 
            246 : 'ouml', 
            247 : 'divide', 
            248 : 'oslash', 
            249 : 'ugrave', 
            250 : 'uacute', 
            251 : 'ucirc', 
            252 : 'uuml', 
            253 : 'yacute', 
            254 : 'thorn', 
            255 : 'yuml', 
            402 : 'fnof', 
            913 : 'Alpha', 
            914 : 'Beta', 
            915 : 'Gamma', 
            916 : 'Delta', 
            917 : 'Epsilon', 
            918 : 'Zeta', 
            919 : 'Eta', 
            920 : 'Theta', 
            921 : 'Iota', 
            922 : 'Kappa', 
            923 : 'Lambda', 
            924 : 'Mu', 
            925 : 'Nu', 
            926 : 'Xi', 
            927 : 'Omicron', 
            928 : 'Pi', 
            929 : 'Rho', 
            931 : 'Sigma', 
            932 : 'Tau', 
            933 : 'Upsilon', 
            934 : 'Phi', 
            935 : 'Chi', 
            936 : 'Psi', 
            937 : 'Omega', 
            945 : 'alpha', 
            946 : 'beta', 
            947 : 'gamma', 
            948 : 'delta', 
            949 : 'epsilon', 
            950 : 'zeta', 
            951 : 'eta', 
            952 : 'theta', 
            953 : 'iota', 
            954 : 'kappa', 
            955 : 'lambda', 
            956 : 'mu', 
            957 : 'nu', 
            958 : 'xi', 
            959 : 'omicron', 
            960 : 'pi', 
            961 : 'rho', 
            962 : 'sigmaf', 
            963 : 'sigma', 
            964 : 'tau', 
            965 : 'upsilon', 
            966 : 'phi', 
            967 : 'chi', 
            968 : 'psi', 
            969 : 'omega', 
            977 : 'thetasym', 
            978 : 'upsih', 
            982 : 'piv', 
            8226 : 'bull', 
            8230 : 'hellip', 
            8242 : 'prime', 
            8243 : 'Prime', 
            8254 : 'oline', 
            8260 : 'frasl', 
            8472 : 'weierp', 
            8465 : 'image', 
            8476 : 'real', 
            8482 : 'trade', 
            8501 : 'alefsym', 
            8592 : 'larr', 
            8593 : 'uarr', 
            8594 : 'rarr', 
            8595 : 'darr', 
            8596 : 'harr', 
            8629 : 'crarr', 
            8656 : 'lArr', 
            8657 : 'uArr', 
            8658 : 'rArr', 
            8659 : 'dArr', 
            8660 : 'hArr', 
            8704 : 'forall', 
            8706 : 'part', 
            8707 : 'exist', 
            8709 : 'empty', 
            8711 : 'nabla', 
            8712 : 'isin', 
            8713 : 'notin', 
            8715 : 'ni', 
            8719 : 'prod', 
            8721 : 'sum', 
            8722 : 'minus', 
            8727 : 'lowast', 
            8730 : 'radic', 
            8733 : 'prop', 
            8734 : 'infin', 
            8736 : 'ang', 
            8743 : 'and', 
            8744 : 'or', 
            8745 : 'cap', 
            8746 : 'cup', 
            8747 : 'int', 
            8756 : 'there4', 
            8764 : 'sim', 
            8773 : 'cong', 
            8776 : 'asymp', 
            8800 : 'ne', 
            8801 : 'equiv', 
            8804 : 'le', 
            8805 : 'ge', 
            8834 : 'sub', 
            8835 : 'sup', 
            8836 : 'nsub', 
            8838 : 'sube', 
            8839 : 'supe', 
            8853 : 'oplus', 
            8855 : 'otimes', 
            8869 : 'perp', 
            8901 : 'sdot', 
            8968 : 'lceil', 
            8969 : 'rceil', 
            8970 : 'lfloor', 
            8971 : 'rfloor', 
            9001 : 'lang', 
            9002 : 'rang', 
            9674 : 'loz', 
            9824 : 'spades', 
            9827 : 'clubs', 
            9829 : 'hearts', 
            9830 : 'diams', 
            338 : 'OElig', 
            339 : 'oelig', 
            352 : 'Scaron', 
            353 : 'scaron', 
            376 : 'Yuml', 
            710 : 'circ', 
            732 : 'tilde', 
            8194 : 'ensp', 
            8195 : 'emsp', 
            8201 : 'thinsp', 
            8204 : 'zwnj', 
            8205 : 'zwj', 
            8206 : 'lrm', 
            8207 : 'rlm', 
            8211 : 'ndash', 
            8212 : 'mdash', 
            8216 : 'lsquo', 
            8217 : 'rsquo', 
            8218 : 'sbquo', 
            8220 : 'ldquo', 
            8221 : 'rdquo', 
            8222 : 'bdquo', 
            8224 : 'dagger', 
            8225 : 'Dagger', 
            8240 : 'permil', 
            8249 : 'lsaquo', 
            8250 : 'rsaquo', 
            8364 : 'euro'
        };
    }

function beautifyCode( code, reserved, skip_css )
{
	reserved = reserved || ["abstract", "else", "instanceof", "super", "boolean", "enum", "int", "switch", "break", "export", "interface", "synchronized", "byte", "extends", "let", "this", "case", "false", "long", "throw", "catch", "final", "native", "throws", "char", "finally", "new", "transient", "class", "float", "null", "true", "const", "for", "package", "try", "continue", "function", "private", "typeof", "debugger", "goto", "protected", "var", "default", "if", "public", "void", "delete", "implements", "return", "volatile", "do", "import", "short", "while", "double", "in", "static", "with"];

	//reserved words
	code = code.replace(/(\w+)/g, function(v) {
		if(reserved.indexOf(v) != -1)
			return "<span class='rsv'>" + v + "</span>";
		return v;
	});

	//numbers
	code = code.replace(/([0-9]+)/g, function(v) {
		return "<span class='num'>" + v + "</span>";
	});

	//obj.method
	code = code.replace(/(\w+\.\w+)/g, function(v) {
		var t = v.split(".");
		return "<span class='obj'>" + t[0] + "</span>.<span class='prop'>" + t[1] + "</span>";
	});

	//function
	code = code.replace(/(\w+)\(/g, function(v) {
		return "<span class='prop'>" + v.substr(0, v.length - 1) + "</span>(";
	});

	//strings
	code = code.replace(/(\"(\\.|[^\"])*\")/g, function(v) {
		return "<span class='str'>" + v + "</span>";
	});

	//comments
	code = code.replace(/(\/\/[a-zA-Z0-9\?\!\(\)_ ]*)/g, function(v) {
		return "<span class='cmnt'>" + v + "</span>";
	});

	if(!skip_css)
		code = "<style>.obj { color: #79B; } .prop { color: #B97; }	.str,.num { color: #A79; } .cmnt { color: #798; } .rsv { color: #9AB; } </style>" + code;

	return code;
}

function beautifyJSON( code, skip_css )
{
	if(typeof(code) == "object")
		code = JSON.stringify(code);

	var reserved = ["false", "true", "null"];

	//reserved words
	code = code.replace(/(\w+)/g, function(v) {
		if(reserved.indexOf(v) != -1)
			return "<span class='rsv'>" + v + "</span>";
		return v;
	});


	//numbers
	code = code.replace(/([0-9]+)/g, function(v) {
		return "<span class='num'>" + v + "</span>";
	});

	//obj.method
	code = code.replace(/(\w+\.\w+)/g, function(v) {
		var t = v.split(".");
		return "<span class='obj'>" + t[0] + "</span>.<span class='prop'>" + t[1] + "</span>";
	});

	//strings
	code = code.replace(/(\"(\\.|[^\"])*\")/g, function(v) {
		return "<span class='str'>" + v + "</span>";
	});

	//comments
	code = code.replace(/(\/\/[a-zA-Z0-9\?\!\(\)_ ]*)/g, function(v) {
		return "<span class='cmnt'>" + v + "</span>";
	});

	if(!skip_css)
		code = "<style>.obj { color: #79B; } .prop { color: #B97; }	.str { color: #A79; } .num { color: #B97; } .cmnt { color: #798; } .rsv { color: #9AB; } </style>" + code;

	return code;
}
//enclose in a scope
(function(){


	function Button(value,options)
	{
		options = options || {};

		if(typeof(options) === "function")
			options = { callback: options };

		var that = this;
		var element = document.createElement("div");
		element.className = "litegui button";

		this.root = element;
		var button = document.createElement("button");
		this.content = button;
		element.appendChild(button);

		button.innerHTML = value;		
		button.addEventListener("click", function(e) { 
			that.click();
		});

		this.click = function()
		{
			if(options.callback)
				options.callback.call(that);
		}
	}

	LiteGUI.Button = Button;

	/**
	* SearchBox 
	*
	* @class SearchBox
	* @constructor
	* @param {*} value
	* @param {Object} options
	*/

	function SearchBox(value, options)
	{
		options = options || {};
		var element = document.createElement("div");
		element.className = "litegui searchbox";
		var placeholder = (options.placeholder != null ? options.placeholder : "Search");
		element.innerHTML = "<input value='"+value+"' placeholder='"+ placeholder +"'/>";
		this.input = element.querySelector("input");
		this.root = element;
		var that = this;

		$(this.input).change( function(e) { 
			var value = e.target.value;
			if(options.callback)
				options.callback.call(that,value);
		});
	}

	SearchBox.prototype.setValue = function(v) { $(this.input).val(v).change(); };
	SearchBox.prototype.getValue = function() { return $(this.input).val(); };

	LiteGUI.SearchBox = SearchBox;


	/**
	* ContextualMenu 
	*
	* @class ContextualMenu
	* @constructor
	* @param {Array} values (allows object { title: "Nice text", callback: function ... })
	*/
	function ContextualMenu(values,options)
	{
		options = options || {};
		this.options = options;
		var that = this;

		var root = document.createElement("div");
		root.className = "litecontextualmenu litemenubar-panel";
		root.style.minWidth = 100;
		root.style.minHeight = 100;
		root.style.pointerEvents = "none";
		setTimeout(function() { root.style.pointerEvents = "auto"; },100); //delay so the mouse up event is not caugh by this element

		//this prevents the default contextual browser menu to open in case this menu was created when pressing right button 
		root.addEventListener("mouseup", function(e){ 
			e.preventDefault(); return true; 
		}, true);
		root.addEventListener("contextmenu", function(e) { 
			if(e.button != 2) //right button
				return false;
			e.preventDefault(); 
			return false;
		},true);

		this.root = root;

		//title
		if(options.title)
		{
			var element = document.createElement("div");
			element.className = "litemenu-title";
			element.innerHTML = options.title;
			root.appendChild(element);
		}

		//entries
		for(var i in values)
		{
			var element = document.createElement("div");
			element.className = "litemenu-entry submenu";

			var name = values.constructor == Array ? values[i] : i;
			var value = values[i];

			if(value === null)
			{
				element.className += "separator";
				element.innerHTML = "<hr/>"
				//continue;
			}
			else
			{
				element.innerHTML = value && value.title ? value.title : name;
				element.value = value;

				if(typeof(value) == "function")
				{
					element.dataset["value"] = name;
					element.onclick_callback = value;
				}
				else if(typeof(value) == "object")
				{
					if(value.callback)
						element.addEventListener("click", function(e) { this.value.callback.apply( this, this.value ); });
				}
				else
					element.dataset["value"] = value;
			}

			root.appendChild(element);
			element.addEventListener("click", inner_onclick);
		}

		//option clicked
		function inner_onclick(e) {
			var value = this.value;
			if(options.callback)
				options.callback.call(that, value, options );
			if(root.parentNode)
				root.parentNode.removeChild( root );
		}

		//if(0)
		root.addEventListener("mouseleave", function(e) {
			if(this.parentNode)
				this.parentNode.removeChild( this );
		});

		//insert before checking position
		document.body.appendChild(root);

		var left = options.left || 0;
		var top = options.top || 0;
		if(options.event)
		{
			left = (options.event.pageX - 10);
			top = (options.event.pageY - 10);
			if(options.title)
				top -= 20;

			var rect = document.body.getClientRects()[0];
			if(left > (rect.width - $(root).width() - 10))
				left = (rect.width - $(root).width() - 10);
			if(top > (rect.height - $(root).height() - 10))
				top = (rect.height - $(root).height() - 10);
		}

		root.style.left = left + "px";
		root.style.top = top  + "px";
	}

	LiteGUI.ContextualMenu = ContextualMenu;


	//the tiny box to expand the children of a node
	function Checkbox( value, on_change)
	{
		var that = this;

		var root = this.root = document.createElement("span");
		root.className = "litecheckbox inputfield";
		root.dataset["value"] = value;

		var element = this.element =document.createElement("span");
		element.className = "fixed flag checkbox "+(value ? "on" : "off");
		root.appendChild( element );
		
		root.addEventListener("click", onClick.bind(this) );

		function onClick(e) {
			this.setValue( this.root.dataset["value"] != "true" );
			e.preventDefault();
			e.stopPropagation();
		}

		this.setValue = function(v)
		{
			if( this.root.dataset["value"] == v.toString())
				return;

			this.root.dataset["value"] = v;
			if(v)
			{
				this.element.classList.remove("off");
				this.element.classList.add("on");
			}
			else
			{
				this.element.classList.remove("on");
				this.element.classList.add("off");
			}

			if(on_change)
				on_change( v );
		}

		this.getValue = function()
		{
			return this.root.dataset["value"] == "true";
		}
	}	

	LiteGUI.Checkbox = Checkbox;


	//the tiny box to expand the children of a node
	function createLitebox(state, on_change)
	{
		var element = document.createElement("span");
		element.className = "listbox " + (state ? "listopen" : "listclosed");
		element.innerHTML = state ? "&#9660;" : "&#9658;";
		element.dataset["value"] = state ? "open" : "closed";
		element.addEventListener("click", onClick );
		element.on_change_callback = on_change;

		element.setEmpty = function(v)
		{
			if(v)
				this.classList.add("empty");
			else
				this.classList.remove("empty");
		}

		element.setValue = function(v)
		{
			if(this.dataset["value"] == (v ? "open" : "closed"))
				return;

			if(!v)
			{
				this.dataset["value"] = "closed";
				this.innerHTML = "&#9658;";
				this.classList.remove("listopen");
				this.classList.add("listclosed");
			}
			else
			{
				this.dataset["value"] = "open";
				this.innerHTML = "&#9660;";
				this.classList.add("listopen");
				this.classList.remove("listclosed");
			}

			if(on_change)
				on_change( this.dataset["value"] );
		}

		element.getValue = function()
		{
			return this.dataset["value"];
		}

		function onClick(e) {
			console.log("CLICK");
			var box = e.target;
			box.setValue( this.dataset["value"] == "open" ? false : true );
			if(this.stopPropagation)
				e.stopPropagation();
		}

		return element;
	}	

	LiteGUI.createLitebox = createLitebox;

	/**
	* List 
	*
	* @class List
	* @constructor
	* @param {String} id
	* @param {Array} values
	* @param {Object} options
	*/
	function List( id, items, options )
	{
		options = options || {};

		var root = this.root = document.createElement("ul");
		root.id = id;
		root.className = "litelist";
		this.items = [];
		var that = this;

		this.callback = options.callback;

		//walk over every item in the list
		for(var i in items)
		{
			var item = document.createElement("li");
			item.className = "list-item";
			item.data = items[i];
			item.dataset["value"] = items[i];

			var content = "";
			if(typeof(items[i]) == "string")
				content = items[i] + "<span class='arrow'></span>";
			else
			{
				content = (items[i].name || items[i].title || "") + "<span class='arrow'></span>";
				if(items[i].id)
					item.id = items[i].id;
			}
			item.innerHTML = content;

			item.addEventListener("click", function() {

				$(root).find(".list-item.selected").removeClass("selected");
				this.classList.add("selected");
				$(that.root).trigger("wchanged", this);
				if(that.callback)
					that.callback( this.data  );
			});

			root.appendChild(item);
		}


		if(options.parent)
		{
			if(options.parent.root)
				options.parent.root.appendChild( root );
			else
				options.parent.appendChild( root );
		}
	}

	List.prototype.getSelectedItem = function()
	{
		return this.root.querySelector(".list-item.selected");
	}

	List.prototype.setSelectedItem = function( name )
	{
		var items = this.root.querySelectorAll(".list-item");
		for(var i = 0; i < items.length; i++)
		{
			var item = items[i];
			if(item.data == name)
			{
				LiteGUI.trigger( item, "click" );
				break;
			}
		}
	}

	LiteGUI.List = List;

	/**
	* Slider 
	*
	* @class Slider
	* @constructor
	* @param {Number} value
	* @param {Object} options
	*/
	function Slider(value, options)
	{
		options = options || {};
		var canvas = document.createElement("canvas");
		canvas.className = "slider " + (options.extraclass ? options.extraclass : "");
		canvas.width = 100;
		canvas.height = 1;
		canvas.style.position = "relative";
		canvas.style.width = "calc( 100% - 2em )";
		canvas.style.height = "1.2em";
		this.root = canvas;
		var that = this;
		this.value = value;

		this.setValue = function(value)
		{
			//var width = canvas.getClientRects()[0].width;
			var ctx = canvas.getContext("2d");
			var min = options.min || 0.0;
			var max = options.max || 1.0;
			if(value < min) value = min;
			else if(value > max) value = max;
			var range = max - min;
			var norm = (value - min) / range;
			ctx.clearRect(0,0,canvas.width,canvas.height);
			ctx.fillStyle = "#999";
			ctx.fillRect(0,0, canvas.width * norm, canvas.height);
			ctx.fillStyle = "#DA2";
			ctx.fillRect(canvas.width * norm - 1,0,2, canvas.height);

			if(value != this.value)
			{
				this.value = value;
				$(this.root).trigger("change", value );
			}
		}

		function setFromX(x)
		{
			var width = canvas.getClientRects()[0].width;
			var norm = x / width;
			var min = options.min || 0.0;
			var max = options.max || 1.0;
			var range = max - min;
			that.setValue( range * norm + min );
		}

		canvas.addEventListener("mousedown", function(e) {
			var mouseX, mouseY;
			if(e.offsetX) { mouseX = e.offsetX; mouseY = e.offsetY; }
			else if(e.layerX) { mouseX = e.layerX; mouseY = e.layerY; }	
			setFromX(mouseX);
			document.addEventListener("mousemove", onMouseMove );
			document.addEventListener("mouseup", onMouseUp );
    	});

		function onMouseMove(e)
		{
			var rect = canvas.getClientRects()[0];
			var x = e.x === undefined ? e.pageX : e.x;
			var mouseX = x - rect.left;
			setFromX(mouseX);
			e.preventDefault();
			return false;
		}

		function onMouseUp(e)
		{
			document.removeEventListener("mousemove", onMouseMove );
			document.removeEventListener("mouseup", onMouseUp );
			e.preventDefault();
			return false;
		}

		this.setValue(value);
	}

	LiteGUI.Slider = Slider;

	/**
	* LineEditor 
	*
	* @class LineEditor
	* @constructor
	* @param {Number} value
	* @param {Object} options
	*/

	function LineEditor(value, options)
	{
		options = options || {};
		var element = document.createElement("div");
		element.className = "curve " + (options.extraclass ? options.extraclass : "");
		element.style.minHeight = "50px";
		element.style.width = options.width || "100%";

		element.bgcolor = options.bgcolor || "#222";
		element.pointscolor = options.pointscolor || "#5AF";
		element.linecolor = options.linecolor || "#444";

		element.value = value || [];
		element.xrange = options.xrange || [0,1]; //min,max
		element.yrange = options.yrange || [0,1]; //min,max
		element.defaulty = options.defaulty != null ? options.defaulty : 0.5;
		element.no_trespassing = options.no_trespassing || false;
		element.show_samples = options.show_samples || 0;
		element.options = options;

		var canvas = document.createElement("canvas");
		canvas.width = options.width || 200;
		canvas.height = options.height || 50;
		element.appendChild(canvas);
		element.canvas = canvas;

		$(canvas).bind("mousedown",onmousedown);
		$(element).resize(onresize);

		element.getValueAt = function(x)
		{
			if(x < element.xrange[0] || x > element.xrange[1])
				return element.defaulty;

			var last = [ element.xrange[0], element.defaulty ];
			var f = 0;
			for(var i = 0; i < element.value.length; i += 1)
			{
				var v = element.value[i];
				if(x == v[0]) return v[1];
				if(x < v[0])
				{
					f = (x - last[0]) / (v[0] - last[0]);
					return last[1] * (1-f) + v[1] * f;
				}
				last = v;
			}

			v = [ element.xrange[1], element.defaulty ];
			f = (x - last[0]) / (v[0] - last[0]);
			return last[1] * (1-f) + v[1] * f;
		}

		element.resample = function(samples)
		{
			var r = [];
			var dx = (element.xrange[1] - element.xrange[0]) / samples;
			for(var i = element.xrange[0]; i <= element.xrange[1]; i += dx)
			{
				r.push( element.getValueAt(i) );
			}
			return r;
		}

		element.addValue = function(v)
		{
			for(var i = 0; i < element.value; i++)
			{
				var value = element.value[i];
				if(value[0] < v[0]) continue;
				element.value.splice(i,0,v);
				redraw();
				return;
			}

			element.value.push(v);
			redraw();
		}

		//value to canvas
		function convert(v)
		{
			return [ canvas.width * ( (element.xrange[1] - element.xrange[0]) * v[0] + element.xrange[0]),
				canvas.height * ((element.yrange[1] - element.yrange[0]) * v[1] + element.yrange[0])];
		}

		//canvas to value
		function unconvert(v)
		{
			return [(v[0] / canvas.width - element.xrange[0]) / (element.xrange[1] - element.xrange[0]),
					(v[1] / canvas.height - element.yrange[0]) / (element.yrange[1] - element.yrange[0])];
		}

		var selected = -1;

		element.redraw = function()
		{
			var ctx = canvas.getContext("2d");
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.translate(0,canvas.height);
			ctx.scale(1,-1);

			ctx.fillStyle = element.bgcolor;
			ctx.fillRect(0,0,canvas.width,canvas.height);

			ctx.strokeStyle = element.linecolor;
			ctx.beginPath();

			//draw line
			var pos = convert([element.xrange[0],element.defaulty]);
			ctx.moveTo( pos[0], pos[1] );

			for(var i in element.value)
			{
				var value = element.value[i];
				pos = convert(value);
				ctx.lineTo( pos[0], pos[1] );
			}

			pos = convert([element.xrange[1],element.defaulty]);
			ctx.lineTo( pos[0], pos[1] );
			ctx.stroke();

			//draw points
			for(var i = 0; i < element.value.length; i += 1)
			{
				var value = element.value[i];
				pos = convert(value);
				if(selected == i)
					ctx.fillStyle = "white";
				else
					ctx.fillStyle = element.pointscolor;
				ctx.beginPath();
				ctx.arc( pos[0], pos[1], selected == i ? 4 : 2, 0, Math.PI * 2);
				ctx.fill();
			}

			if(element.show_samples)
			{
				var samples = element.resample(element.show_samples);
				ctx.fillStyle = "#888";
				for(var i = 0; i < samples.length; i += 1)
				{
					var value = [ i * ((element.xrange[1] - element.xrange[0]) / element.show_samples) + element.xrange[0], samples[i] ];
					pos = convert(value);
					ctx.beginPath();
					ctx.arc( pos[0], pos[1], 2, 0, Math.PI * 2);
					ctx.fill();
				}
			}
		}

		var last_mouse = [0,0];
		function onmousedown(evt)
		{
			$(document).bind("mousemove",onmousemove);
			$(document).bind("mouseup",onmouseup);

			var rect = canvas.getBoundingClientRect();
			var mousex = evt.clientX - rect.left;
			var mousey = evt.clientY - rect.top;

			selected = computeSelected(mousex,canvas.height-mousey);

			if(selected == -1)
			{
				var v = unconvert([mousex,canvas.height-mousey]);
				element.value.push(v);
				sortValues();
				selected = element.value.indexOf(v);
			}

			last_mouse = [mousex,mousey];
			element.redraw();
			evt.preventDefault();
			evt.stopPropagation();
		}

		function onmousemove(evt)
		{
			var rect = canvas.getBoundingClientRect();
			var mousex = evt.clientX - rect.left;
			var mousey = evt.clientY - rect.top;

			if(mousex < 0) mousex = 0;
			else if(mousex > canvas.width) mousex = canvas.width;
			if(mousey < 0) mousey = 0;
			else if(mousey > canvas.height) mousey = canvas.height;

			//dragging to remove
			if( selected != -1 && distance( [evt.clientX - rect.left, evt.clientY - rect.top], [mousex,mousey] ) > canvas.height * 0.5 )
			{
				element.value.splice(selected,1);
				onmouseup(evt);
				return;
			}

			var dx = last_mouse[0] - mousex;
			var dy = last_mouse[1] - mousey;
			var delta = unconvert([-dx,dy]);
			if(selected != -1)
			{
				var minx = element.xrange[0];
				var maxx = element.xrange[1];

				if(element.no_trespassing)
				{
					if(selected > 0) minx = element.value[selected-1][0];
					if(selected < (element.value.length-1) ) maxx = element.value[selected+1][0];
				}

				var v = element.value[selected];
				v[0] += delta[0];
				v[1] += delta[1];
				if(v[0] < minx) v[0] = minx;
				else if(v[0] > maxx) v[0] = maxx;
				if(v[1] < element.yrange[0]) v[1] = element.yrange[0];
				else if(v[1] > element.yrange[1]) v[1] = element.yrange[1];
			}

			sortValues();
			element.redraw();
			last_mouse[0] = mousex;
			last_mouse[1] = mousey;
			onchange();

			evt.preventDefault();
			evt.stopPropagation();
		}

		function onmouseup(evt)
		{
			selected = -1;
			element.redraw();
			$(document).unbind("mousemove",onmousemove);
			$(document).unbind("mouseup",onmouseup);
			onchange();
			evt.preventDefault();
			evt.stopPropagation();
		}

		function onresize(e)
		{
			canvas.width = $(this).width();
			canvas.height = $(this).height();
			element.redraw();
		}
		
		function onchange()
		{
			if(options.callback)
				options.callback.call(element,element.value);
			else
				$(element).change();
		}

		function distance(a,b) { return Math.sqrt( Math.pow(b[0]-a[0],2) + Math.pow(b[1]-a[1],2) ); };

		function computeSelected(x,y)
		{
			var min_dist = 100000;
			var max_dist = 8; //pixels
			var selected = -1;
			for(var i=0; i < element.value.length; i++)
			{
				var value = element.value[i];
				var pos = convert(value);
				var dist = distance([x,y],pos);
				if(dist < min_dist && dist < max_dist)
				{
					min_dist = dist;
					selected = i;
				}
			}
			return selected;
		}

		function sortValues()
		{
			var v = null;
			if(selected != -1)
				v = element.value[selected];
			element.value.sort(function(a,b) { return a[0] > b[0]; });
			if(v)
				selected = element.value.indexOf(v);
		}
		
		element.redraw();
		return element;
	}

	LiteGUI.LineEditor = LineEditor;

})();
//enclose in a scope
(function(){

	
	/****************** AREA **************/
	/**
	* Areas can be split several times horizontally or vertically to fit different colums or rows
	*
	* @class Area
	* @constructor
	*/
	function Area(id, options)
	{
		options = options || {};
		/* the root element containing all sections */
		var element = document.createElement("div");
		element.className = "litearea";
		if(id) element.id = id;
		this.root = element;
		this.root.litearea = this; //dbl link

		var width = options.width || "100%";
		var height = options.height || "100%";

		if( width < 0 )
			width = 'calc( 100% - '+Math.abs(width)+'px)';
		if( height < 0 )
			height = 'calc( 100% - '+ Math.abs(height)+'px)';

		element.style.width = width;
		element.style.height = height;

		this.options = options;

		var that = this;
		window.addEventListener("resize",function(e) { that.resize(e); });
		//$(this).bind("resize",function(e) { that.resize(e); });

		this._computed_size = [ $(this.root).width(), $(this.root).height() ];

		var content = document.createElement("div");
		if(options.content_id)
			content.id = options.content_id;
		content.className = "liteareacontent";
		content.style.width = "100%";
		content.style.height = "100%";
		this.root.appendChild(content);
		this.content = content;

		this.split_direction = "none";
		this.sections = [];

		if(options.autoresize)
			$(LiteGUI).bind("resized", function() { 
				that.resize(); 
			});
	}

	Area.splitbar_size = 4;

	/* get container of the section */
	Area.prototype.getSection = function(num)
	{
		num = num || 0;
		if(this.sections.length > num)
			return this.sections[num];
		return null;
	}

	Area.prototype.resize = function(e)
	{
		var computed_size = [ $(this.root).width(), $(this.root).height() ];
		if( e && this._computed_size && computed_size[0] == this._computed_size[0] && computed_size[1] == this._computed_size[1])
			return;

		this.sendResizeEvent(e);
	}

	Area.prototype.adjustHeight = function()
	{
		if(!this.root.parentNode)
		{
			console.error("Cannot adjust height of LiteGUI.Area without parent");
			return;
		}

		//check parent height
		var h = this.root.parentNode.offsetHeight;

		//check position
		var y = this.root.getClientRects()[0].top;

		//adjust height
		this.root.style.height = "calc( 100% - " + y + "px )";
	}

	Area.prototype.sendResizeEvent = function(e)
	{
		if(this.sections.length)
			for(var i in this.sections)
			{
				var section = this.sections[i];
				section.resize(e);
				//$(section).trigger("resize"); //it is a LiteArea
				//$(section.root).trigger("resize");
				/*
				for (var j = 0; j < section.root.childNodes.length; j++)
					$(section.root.childNodes[j]).trigger("resize");
				*/
			}
		else //send it to the children
		{
			for (var j = 0; j < this.root.childNodes.length; j++)
			{
				var element = this.root.childNodes[j];
				if(element.litearea)
					element.litearea.resize();
				else
					$(element).trigger("resize");
			}
		}

		if( this.onresize )
			this.onresize();
	}

	Area.prototype.split = function(direction, sizes, editable)
	{
		direction = direction || "vertical";

		if(this.sections.length) throw "cannot split twice";

		//create areas
		var area1 = new LiteGUI.Area(null, { content_id: this.content.id });
		area1.root.style.display = "inline-block";
		var area2 = new LiteGUI.Area();
		area2.root.style.display = "inline-block";

		var splitinfo = "";
		var splitbar = null;
		var dynamic_section = null;
		if(editable)
		{
			splitinfo = " - " + (Area.splitbar_size + 2) +"px"; //2 px margin ¿?
			splitbar = document.createElement("div");
			splitbar.className = "litesplitbar " + direction;
			if(direction == "vertical")
				splitbar.style.height = Area.splitbar_size + "px";
			else
				splitbar.style.width = Area.splitbar_size + "px";
			this.splitbar = splitbar;
			splitbar.addEventListener("mousedown", inner_mousedown);
		}

		sizes = sizes || ["50%",null];

		if(direction == "vertical")
		{
			area1.root.style.width = "100%";
			area2.root.style.width = "100%";

			if(sizes[0] == null)
			{
				var h = sizes[1];
				if(typeof(h) == "number")
					h = sizes[1] + "px";

				area1.root.style.height = "-moz-calc( 100% - " + h + splitinfo + " )";
				area1.root.style.height = "-webkit-calc( 100% - " + h + splitinfo + " )";
				area1.root.style.height = "calc( 100% - " + h + splitinfo + " )";
				area2.root.style.height = h;
				area2.size = h;
				dynamic_section = area1;
			}
			else if(sizes[1] == null)
			{
				var h = sizes[0];
				if(typeof(h) == "number")
					h = sizes[0] + "px";

				area1.root.style.height = h;
				area1.size = h;
				area2.root.style.height = "-moz-calc( 100% - " + h + splitinfo + " )";
				area2.root.style.height = "-webkit-calc( 100% - " + h + splitinfo + " )";
				area2.root.style.height = "calc( 100% - " + h + splitinfo + " )";
				dynamic_section = area2;
			}
			else
			{
				var h1 = sizes[0];
				if(typeof(h1) == "number")
					h1 = sizes[0] + "px";
				var h2 = sizes[1];
				if(typeof(h2) == "number")
					h2 = sizes[1] + "px";
				area1.root.style.height = h1;
				area1.size = h1;
				area2.root.style.height = h2;
				area2.size = h2;
			}
		}
		else //horizontal
		{
			area1.root.style.height = "100%";
			area2.root.style.height = "100%";

			if(sizes[0] == null)
			{
				var w = sizes[1];
				if(typeof(w) == "number")
					w = sizes[1] + "px";
				area1.root.style.width = "-moz-calc( 100% - " + w + splitinfo + " )";
				area1.root.style.width = "-webkit-calc( 100% - " + w + splitinfo + " )";
				area1.root.style.width = "calc( 100% - " + w + splitinfo + " )";
				area2.root.style.width = w;
				area2.size = sizes[1];
				dynamic_section = area1;
			}
			else if(sizes[1] == null)
			{
				var w = sizes[0];
				if(typeof(w) == "number")
					w = sizes[0] + "px";

				area1.root.style.width = w;
				area1.size = w;
				area2.root.style.width = "-moz-calc( 100% - " + w + splitinfo + " )";
				area2.root.style.width = "-webkit-calc( 100% - " + w + splitinfo + " )";
				area2.root.style.width = "calc( 100% - " + w + splitinfo + " )";
				dynamic_section = area2;
			}
			else
			{
				var w1 = sizes[0];
				if(typeof(w1) == "number")
					w1 = sizes[0] + "px";
				var w2 = sizes[1];
				if(typeof(w2) == "number")
					w2 = sizes[1] + "px";

				area1.root.style.width = w1;
				area1.size = w1;
				area2.root.style.width = w2;
				area2.size = w2;
			}
		}

		area1.root.removeChild( area1.content );
		area1.root.appendChild( this.content );
		area1.content = this.content;

		this.root.appendChild( area1.root );
		if(splitbar)
			this.root.appendChild( splitbar );
		this.root.appendChild( area2.root );

		this.sections = [area1, area2];
		this.dynamic_section = dynamic_section;
		this.direction = direction;

		//SPLITTER DRAGGER INTERACTION
		var that = this;
		var last_pos = [0,0];
		function inner_mousedown(e)
		{
			var doc = that.root.ownerDocument;
			doc.addEventListener("mousemove",inner_mousemove);
			doc.addEventListener("mouseup",inner_mouseup);
			last_pos[0] = e.pageX;
			last_pos[1] = e.pageY;
			e.stopPropagation();
			e.preventDefault();
		}

		function inner_mousemove(e)
		{
			if(direction == "horizontal")
			{
				if (last_pos[0] != e.pageX)
					that.moveSplit(last_pos[0] - e.pageX);
			}
			else if(direction == "vertical")
			{
				if (last_pos[1] != e.pageY)
					that.moveSplit(e.pageY - last_pos[1]);
			}

			last_pos[0] = e.pageX;
			last_pos[1] = e.pageY;
			e.stopPropagation();
			e.preventDefault();
			if(that.options.inmediateResize)
				that.resize();
		}

		function inner_mouseup(e)
		{
			var doc = that.root.ownerDocument;
			doc.removeEventListener("mousemove",inner_mousemove);
			doc.removeEventListener("mouseup",inner_mouseup);
			that.resize();
		}
	}

	Area.prototype.hide = function()
	{
		this.root.style.display = "none";
	}

	Area.prototype.show = function()
	{
		this.root.style.display = "block";
	}

	Area.prototype.showSection = function(num)
	{
		var section = this.sections[num];
		var size = 0;
		
		if(this.direction == "horizontal")
			size = section.root.style.width;
		else
			size = section.root.style.height;

		if(size.indexOf("calc") != -1)
			size = "50%";

		for(var i in this.sections)
		{
			var section = this.sections[i];

			if(i == num)
				section.root.style.display = "inline-block";
			else
			{
				if(this.direction == "horizontal")
					section.root.style.width = "calc( 100% - " + size + " - 5px)";
				else
					section.root.style.height = "calc( 100% - " + size + " - 5px)";
			}
		}

		if(this.splitbar)
			this.splitbar.style.display = "inline-block";

		this.sendResizeEvent();
	}

	Area.prototype.hideSection = function(num)
	{
		for(var i in this.sections)
		{
			var section = this.sections[i];

			if(i == num)
				section.root.style.display = "none";
			else
			{
				if(this.direction == "horizontal")
					section.root.style.width = "100%";
				else
					section.root.style.height = "100%";
			}
		}

		if(this.splitbar)
			this.splitbar.style.display = "none";

		this.sendResizeEvent();
	}

	Area.prototype.moveSplit = function(delta)
	{
		if(!this.sections) return;

		var area1 = this.sections[0];
		var area2 = this.sections[1];
		var splitinfo = " - "+ Area.splitbar_size +"px";

		if(this.direction == "horizontal")
		{

			if (this.dynamic_section == area1)
			{
				var size = ($(area2.root).width() + delta) + "px";
				area1.root.style.width = "-moz-calc( 100% - " + size + splitinfo + " )";
				area1.root.style.width = "-webkit-calc( 100% - " + size + splitinfo + " )";
				area1.root.style.width = "calc( 100% - " + size + splitinfo + " )";
				area2.root.style.width = size;
			}
			else
			{
				var size = ($(area1.root).width() - delta) + "px";
				area1.root.style.width = size;
				area2.root.style.width = "-moz-calc( 100% - " + size + splitinfo + " )";
				area2.root.style.width = "-webkit-calc( 100% - " + size + splitinfo + " )";
				area2.root.style.width = "calc( 100% - " + size + splitinfo + " )";
			}
		}
		else if(this.direction == "vertical")
		{
			if (this.dynamic_section == area1)
			{
				var size = ($(area2.root).height() - delta) + "px";
				area1.root.style.height = "-moz-calc( 100% - " + size + splitinfo + " )";
				area1.root.style.height = "-webkit-calc( 100% - " + size + splitinfo + " )";
				area1.root.style.height = "calc( 100% - " + size + splitinfo + " )";
				area2.root.style.height = size;
			}
			else
			{
				var size = ($(area1.root).height() + delta) + "px";
				area1.root.style.height = size;
				area2.root.style.height = "-moz-calc( 100% - " + size + splitinfo + " )";
				area2.root.style.height = "-webkit-calc( 100% - " + size + splitinfo + " )";
				area2.root.style.height = "calc( 100% - " + size + splitinfo + " )";
			}
		}

		LiteGUI.trigger( this.root, "split_moved");
		var areas = this.root.querySelectorAll(".litearea");
		for(var i = 0; i < areas.length; ++i)
			LiteGUI.trigger( areas[i], "split_moved" );
	}

	Area.prototype.addEventListener = function(a,b,c,d)
	{
		return this.root.addEventListener(a,b,c,d);
	}

	Area.prototype.setAreaSize = function(area,size)
	{
		var element = this.sections[1];

		var splitinfo = " - "+Area.splitbar_size+"px";
		element.root.style.width = "-moz-calc( 100% - " + size + splitinfo + " )";
		element.root.style.width = "-webkit-calc( 100% - " + size + splitinfo + " )";
		element.root.style.width = "calc( 100% - " + size + splitinfo + " )";
	}

	Area.prototype.merge = function(main_section)
	{
		if(this.sections.length == 0) throw "not splitted";

		var main = this.sections[main_section || 0];

		this.root.appendChild( main.content );
		this.content = main.content;

		this.root.removeChild( this.sections[0].root );
		this.root.removeChild( this.sections[1].root );

		/*
		while(main.childNodes.length > 0)
		{
			var e = main.childNodes[0];
			this.root.appendChild(e);
		}

		this.root.removeChild( this.sections[0].root );
		this.root.removeChild( this.sections[1].root );
		*/

		this.sections = [];
		this._computed_size = null;
		this.resize();
	}

	Area.prototype.add = function(v)
	{
		if(typeof(v) == "string")
		{
			var element = document.createElement("div");
			element.innerHTML = v;
			v = element;
		}

		this.content.appendChild( v.root || v );
	}

	Area.prototype.query = function(v)
	{
		return this.root.querySelector(v);
	}

	LiteGUI.Area = Area;

	/***************** SPLIT ******************/

	/**
	* Split 
	*
	* @class Split
	* @constructor
	*/
	function Split(id, sections, options)
	{
		options = options || {};

		var root = document.createElement("div");
		this.root = root;
		root.id = id;
		root.className = "litesplit " + (options.vertical ? "vsplit" : "hsplit");
		this.sections = [];

		for(var i in sections)
		{
			var section = document.createElement("div");

			section.className = "split-section split" + i;
			if(typeof(sections[i]) == "number")
			{
				if(options.vertical)
					section.style.height = sections[i].toFixed(1) + "%";
				else
					section.style.width = sections[i].toFixed(1) + "%";
			}
			else if(typeof(sections[i]) == "string")
			{
				if(options.vertical)
					section.style.height = sections[i];
				else
					section.style.width = sections[i];
			}
			else
			{
				if(sections[i].id) section.id = sections[i].id;
				if(options.vertical)
					section.style.height = (typeof(sections[i].height) == "Number" ? sections[i].height.toFixed(1) + "%" : sections[i].height);
				else
					section.style.width = (typeof(sections[i].width) == "Number" ? sections[i].width.toFixed(1) + "%" : sections[i].width);
			}

			section.add = function(element) {
				this.appendChild( element.root || element );
			}

			this.sections.push(section);
			root.appendChild(section);
		}

		if(options.parent)
		{
			if(options.parent.root)
				options.parent.root.appendChild(root);
			else
				options.parent.appendChild(root);
		}

		this.getSection = function(n)
		{
			return this.sections[n];
		}
	}

	LiteGUI.Split = Split;

})();
(function(){

	/************** MENUBAR ************************/
	function Menubar(id)
	{
		this.menu = [];
		this.panels = [];

		this.root = document.createElement("div");
		this.root.id = id;
		this.root.className = "litemenubar";

		this.content = document.createElement("ul");
		this.root.appendChild( this.content );

		this.is_open = false;
	}

	Menubar.closing_time = 500;

	Menubar.prototype.clear = function()
	{
		this.content.innerHTML = "";
		this.menu = [];
		this.panels = [];
	}

	Menubar.prototype.attachToPanel = function(panel)
	{
		$(panel.content).prepend(this.root);
	}

	Menubar.prototype.add = function( path, data )
	{
		data = data || {};

		if( typeof(data) == "function" )
			data = { callback: data };

		var prev_length = this.menu.length;

		var tokens = path.split("/");
		var current_token = 0;
		var current_pos = 0;
		var menu = this.menu;
		var last_item = null;

		while( menu )
		{
			if(current_token > 5)
				throw("Error: Menubar too deep");
			//token not found in this menu, create it
			if( menu.length == current_pos )
			{
				var v = { parent: last_item, children: [] };
				last_item = v;
				if(current_token == tokens.length - 1)
					v.data = data;

				v.disable = function() { if( this.data ) this.data.disabled = true; }
				v.enable = function() { if( this.data ) delete this.data.disabled; }

				v.name = tokens[ current_token ];
				menu.push( v );
				current_token++;
				if( current_token == tokens.length )
					break;
				v.children = [];
				menu = v.children;
				current_pos = 0;
				continue;
			}

			//token found in this menu, get inside for next token
			if( menu[ current_pos ] && tokens[ current_token ] == menu[ current_pos ].name )
			{
				if(current_token < tokens.length - 1)
				{
					last_item = menu[ current_pos ];
					menu = menu[ current_pos ].children;
					current_pos = 0;
					current_token++;
					continue;
				}
				else //last token
				{
					console.warn("Warning: Adding menu that already exists: " + path );
					break;
				}
			}
			current_pos++;
		}

		if(prev_length != this.menu.length)
			this.updateMenu();
	};

	Menubar.prototype.remove = function( path )
	{
		var menu = this.findMenu( path );
		if(!menu)
			return;
		if(!menu.parent || !menu.parent.children)
			return console.warn("menu without parent?");
		
		var index = menu.parent.children.indexOf( menu );
		if(index != -1)
			menu.parent.children.splice( index, 1 );
	},

	Menubar.prototype.separator = function( path, order )
	{
		var menu = this.findMenu( path );
		if(!menu)
			return;
		menu.children.push( {separator: true, order: order || 10 } );
	}

	//returns the menu entry that matches this path
	Menubar.prototype.findMenu = function( path )
	{
		var tokens = path.split("/");
		var current_token = 0;
		var current_pos = 0;
		var menu = this.menu;

		while( menu )
		{
			//no more tokens, return last found menu
			if(current_token == tokens.length)
				return menu;

			//this menu doesnt have more entries
			if(menu.length <= current_pos)
				return null;

			if(tokens[ current_token ] == "*")
				return menu[ current_pos ].children;

			//token found in this menu, get inside for next token
			if( tokens[ current_token ] == menu[ current_pos ].name )
			{
				if(current_token == tokens.length - 1) //last token
				{
					return menu[ current_pos ];
				}
				else
				{
					menu = menu[ current_pos ].children;
					current_pos = 0;
					current_token++;
					continue;
				}
			}

			//check next entry in this menu
			current_pos++;
		}
		return null;
	}

	//update top main menu
	Menubar.prototype.updateMenu = function()
	{
		var that = this;

		this.content.innerHTML = "";
		for(var i in this.menu)
		{
			var element = document.createElement("li");
			element.innerHTML = "<span class='icon'></span><span class='name'>" + this.menu[i].name + "</span>";
			this.content.appendChild(element);
			element.data = this.menu[i];
			this.menu[i].element = element;

			/* ON CLICK TOP MAIN MENU ITEM */
			element.addEventListener("click", function(e) {
				var item = this.data;

				if(item.data && item.data.callback && typeof(item.data.callback) == "function")
					item.data.callback(item.data);

				if(!that.is_open)
				{
					//$(document).bind("click",inner_outside);
					that.is_open = true;
					that.showMenu( item, e, this );
				}
				else
				{
					that.is_open = false;
					that.hidePanels();
				}
			});

			element.addEventListener("mouseover", function(e) {
				that.hidePanels();
				if(that.is_open)
					that.showMenu( this.data, e, this );
			});
		}
	}

	Menubar.prototype.hidePanels = function() {
		if(!this.panels.length)
			return;

		for(var i in this.panels)
			LiteGUI.remove(this.panels[i]);
		this.panels = [];
	}

	//Create the panel with the drop menu
	Menubar.prototype.showMenu = function(menu, e, root, is_submenu) {

		if(!is_submenu)
			this.hidePanels();

		if(!menu.children || !menu.children.length)
			return;
		var that = this;
		if(that.closing_by_leave)
			clearInterval(that.closing_by_leave);

		var element = document.createElement("div");
		element.className = "litemenubar-panel";

		var sorted_entries = [];
		for(var i in menu.children)
			sorted_entries.push(menu.children[i]);

		sorted_entries.sort(function(a,b) {
			var a_order = 10;
			var b_order = 10;
			if(a && a.data && a.data.order != null) a_order = a.data.order;
			if(a && a.separator && a.order != null) a_order = a.order;
			if(b && b.data && b.data.order != null) b_order = b.data.order;
			if(b && b.separator && b.order != null) b_order = b.order;
			return a_order - b_order;
		});

		for(var i in sorted_entries)
		{
			var item = document.createElement("p");
			var menu_item = sorted_entries[i];

			item.className = 'litemenu-entry ' + ( item.children ? " submenu" : "" );
			if(menu_item && menu_item.name)
				item.innerHTML = "<span class='icon'></span><span class='name'>" + menu_item.name + (menu_item.children && menu_item.children.length ? "<span class='more'>+</span>":"") + "</span>";
			else
				item.innerHTML = "<span class='separator'></span>";

			item.data = menu_item;

			//check if it has to show the item being 'checked'
			if( item.data.data )
			{
				var data = item.data.data;

				var checked = (data.type == "checkbox" && data.instance && data.property && data.instance[ data.property ] == true) || 
					data.checkbox == true ||
					(data.instance && data.property && data.hasOwnProperty("value") && data.instance[data.property] == data.value) ||
					(typeof( data.isChecked ) == "function" && data.isChecked.call(data.instance, data) );

				if(checked)
					item.className += " checked";

				if(data.disabled)
					item.className += " disabled";
			}

			/* ON CLICK SUBMENU ITEM */
			item.addEventListener("click",function(){
				var item = this.data;
				if(item.data)
				{
					if(item.data.disabled)
						return;

					//to change variables directly
					if(item.data.instance && item.data.property)
					{
						if( item.data.type == "checkbox" )
						{
							item.data.instance[item.data.property] = !item.data.instance[item.data.property];
							if(	item.data.instance[item.data.property] )
								this.classList.add("checked");
							else
								this.classList.remove("checked");
						}
						else if( item.data.hasOwnProperty("value") )
						{
							item.data.instance[item.data.property] = item.data.value;
						}
					}

					//to have a checkbox behaviour
					if(item.data.checkbox != null)
					{
						item.data.checkbox = !item.data.checkbox;
						if(	item.data.checkbox )
							this.classList.add("checked");
						else
							this.classList.remove("checked");
					}

					//execute a function
					if(item.data.callback && typeof(item.data.callback) == "function")
						item.data.callback(item.data);
				}

				//more menus
				if(item.children && item.children.length)
				{
					that.showMenu( item, e, this, true );
				}
				else
				{
					that.is_open = false;
					that.hidePanels();
				}
			});
			element.appendChild( item );
		}

		element.addEventListener("mouseleave",function(e){
			//if( $(e.target).hasClass("litemenubar-panel") || $(e.target).parents().hasClass("litemenubar-panel") ) 	return;
			
			if(that.closing_by_leave) clearInterval(that.closing_by_leave);
			that.closing_by_leave = setTimeout( function() { 
				that.is_open = false;
				that.hidePanels();
			},LiteGUI.Menubar.closing_time);
		});

		element.addEventListener("mouseenter",function(e){
			if(that.closing_by_leave) clearInterval(that.closing_by_leave);
			that.closing_by_leave = null;
		});

		var jQ = $(root); //$(menu.element);
		element.style.left = jQ.offset().left + ( is_submenu ? 200 : 0 ) + "px";
		element.style.top = jQ.offset().top + jQ.height() + ( is_submenu ? -20 : 2 ) + "px";

		this.panels.push(element);
		document.body.appendChild( element );
		$(element).hide().show();
	}

	LiteGUI.Menubar = Menubar;
})();
/**************  ***************************/
(function(){
	
	function Tabs(id,options)
	{
		options = options || {};
		this.options = options;

		var mode = this.mode = options.mode || "horizontal";

		var root = document.createElement("DIV");
		if(id) 
			root.id = id;
		root.data = this;
		root.className = "litetabs " + mode;
		this.root = root;
		this.root.tabs = this;

		this.current_tab = null; //current tab array [id, tab, content]

		if(mode == "horizontal")
		{
			if(options.size)
			{
				if(options.size == "full")
					this.root.style.height = "100%";
				else
					this.root.style.height = options.size;
			}
		}
		else if(mode == "vertical")
		{
			if(options.size)
			{
				if(options.size == "full")
					this.root.style.width = "100%";
				else
					this.root.style.width = options.size;
			}
		}


		//container of tab elements
		var list = document.createElement("UL");
		list.className = "wtabcontainer";
		if(mode == "vertical")
			list.style.width = LiteGUI.Tabs.tabs_width + "px";
		else
			list.style.height = LiteGUI.Tabs.tabs_height + "px";

		this.list = list;
		this.root.appendChild(this.list);
		this.tabs_root = list;

		this.tabs = {};
		this.selected = null;

		this.onchange = options.callback;

		if(options.parent)
			this.appendTo(options.parent);
	}

	Tabs.tabs_width = 64;
	Tabs.tabs_height = 26;

	Tabs.prototype.show = function()
	{
		this.root.style.display = "block";
	}

	Tabs.prototype.hide = function()
	{
		this.root.style.display = "none";
	}

	Tabs.prototype.getCurrentTab = function()
	{
		if(!this.current_tab)
			return null;
		return this.tabs[ this.current_tab[0] ];
	}

	Tabs.prototype.getCurrentTabId = function()
	{
		return this.current_tab[0];
	}

	//used to know from which tab we come
	Tabs.prototype.getPreviousTab = function()
	{
		if(!this.previous_tab)
			return null;
		return this.tabs[ this.previous_tab[0] ];
	}

	Tabs.prototype.appendTo = function(parent,at_front)
	{
		if(at_front)
			$(parent).prepend(this.root);
		else
			$(parent).append(this.root);
	}

	Tabs.prototype.getTab = function(id)
	{
		return this.tabs[id];
	}

	Tabs.prototype.getNumOfTabs = function()
	{
		var num = 0;
		for(var i in this.tabs)
			num++;
		return num;
	}

	Tabs.prototype.getTabContent = function(id)
	{
		var tab = this.tabs[id];
		if(tab)
			return tab.content;
	}

	Tabs.prototype.getTabIndex = function(id)
	{
		var tab = this.tabs[id];
		if(!tab)
			return -1;
		for(var i = 0; i < this.list.childNodes.length; i++)
			if( this.list.childNodes[i] == tab.tab )
				return i;
		return -1;
	}


	//create a new tab, where name is a unique identifier
	Tabs.prototype.addTab = function( id, options, skip_event )
	{
		options = options || {};
		if(typeof(options) == "function")
			options = { callback: options };

		var that = this;

		//the tab element
		var element = document.createElement("LI");
		var safe_id = id.replace(/ /gi,"_");
		element.className = "wtab wtab-" + safe_id + " ";
		//if(options.selected) element.className += " selected";
		element.dataset["id"] = id;
		element.innerHTML = "<span class='tabtitle'>" + (options.title || id) + "</span>";

		if(options.button)
			element.className += "button ";
		if(options.tab_className)
			element.className += options.tab_className;
		if(options.bigicon)
			element.innerHTML = "<img class='tabbigicon' src='" + options.bigicon+"'/>" + element.innerHTML;
		if(options.closable)
		{
			element.innerHTML += "<span class='tabclose'>" + LiteGUI.special_codes.close + "</span>";
			element.querySelector("span.tabclose").addEventListener("click", function(e) { 
				that.removeTab(id);
				e.preventDefault();
				e.stopPropagation();
			},true);
		}
		//WARNING: do not modify element.innerHTML or event will be lost

		if( options.index !== undefined )
		{
			var after = this.list.childNodes[options.index];
			if(after)
				this.list.insertBefore(element,after);
			else
				this.list.appendChild(element);
		}
		else
			this.list.appendChild(element);

		if(options.tab_width)
		{
			element.style.width = options.tab_width.constructor === Number ? ( options.tab_width.toFixed(0) + "px" ) : options.tab_width;
			element.style.minWidth = "0";
		}

		//the content of the tab
		var content = document.createElement("div");
		if(options.id)
			content.id = options.id;

		content.className = "wtabcontent " + "wtabcontent-" + safe_id + " " + (options.className || "");
		content.dataset["id"] = id;
		content.style.display = "none";

		//adapt height
		if(this.mode == "horizontal")
		{
			if(options.size)
			{
				content.style.overflow = "auto";
				if(options.size == "full")
				{
					content.style.height = "calc( 100% - "+LiteGUI.Tabs.tabs_height+"px )"; //minus title
					content.style.height = "-moz-calc( 100% - "+LiteGUI.Tabs.tabs_height+"px )"; //minus title
					content.style.height = "-webkit-calc( 100% - "+LiteGUI.Tabs.tabs_height+"px )"; //minus title
					//content.style.height = "-webkit-calc( 90% )"; //minus title
				}
				else
					content.style.height = options.size;
			}
		}
		else if(this.mode == "vertical")
		{
			if(options.size)
			{
				content.style.overflow = "auto";
				if(options.size == "full")
				{
					content.style.width = "calc( 100% - "+LiteGUI.Tabs.tabs_width+"px )"; //minus title
					content.style.width = "-moz-calc( 100% - "+LiteGUI.Tabs.tabs_width+"px )"; //minus title
					content.style.width = "-webkit-calc( 100% - "+LiteGUI.Tabs.tabs_width+"px )"; //minus title
					//content.style.height = "-webkit-calc( 90% )"; //minus title
				}
				else
					content.style.width = options.size;
			}
		}

		//overwrite
		if(options.width !== undefined )
			content.style.width = typeof(options.width) === "string" ? options.width : options.width + "px";
		if(options.height !== undefined )
			content.style.height = typeof(options.height) === "string" ? options.height : options.height + "px";

		//add content
		if(options.content)
		{
			if (typeof(options.content) == "string")
				content.innerHTML = options.content;
			else
				content.appendChild(options.content);
		}
		this.root.appendChild(content);

		//when clicked
		if(!options.button)
			element.addEventListener("click", Tabs.prototype.onTabClicked );
		else
			element.addEventListener("click", function(e){ 
				var tab_id = this.dataset["id"];
				if(options.callback)
					options.callback( tab_id, e );
			});

		element.options = options;
		element.tabs = this;

		var tab_info = {id: id, tab: element, content: content, add: function(v) { this.content.appendChild(v.root || v); }};
		if(options.onclose)
			tab_info.onclose = options.onclose;
		this.tabs[id] = tab_info;

		if ( options.selected == true || this.selected == null )
			this.selectTab( id, options.skip_callbacks );

		return tab_info;
	}

	//this is tab
	Tabs.prototype.onTabClicked = function(e)
	{
		//skip if already selected
		if( this.classList.contains("selected") ) 
			return;

		if(!this.parentNode)
			return; //this could happend if it gets removed while being clicked (not common)

		var options = this.options;
		var tabs = this.parentNode.parentNode.tabs;
		if(!tabs)
			throw("tabs not found");
		var that = tabs;

		//check if this tab is available
		if(options.callback_canopen && options.callback_canopen() == false)
			return;

		var tab_id = this.dataset["id"];
		var tab_content = null;

		//iterate tab labels
		for(var i in that.tabs)
		{
			var tab_info = that.tabs[i];
			if( i == tab_id )
			{
				tab_info.selected = true;
				tab_info.content.style.display = null;
				tab_content = tab_info.content;
			}
			else
			{
				delete tab_info.selected;
				tab_info.content.style.display = "none";
			}
		}

		$(that.list).find("li.wtab").removeClass("selected");
		this.classList.add("selected");

		//launch leaving current tab event
		if( that.current_tab && 
			that.current_tab[0] != tab_id && 
			that.current_tab[2] && 
			that.current_tab[2].callback_leave)
				that.current_tab[2].callback_leave( that.current_tab[0], that.current_tab[1], that.current_tab[2] );

		//change tab
		that.previous_tab = that.current_tab;
		that.current_tab = [tab_id, tab_content, options];

		if(e) //user clicked
		{
			//launch callback
			if(options.callback) 
				options.callback(tab_id, tab_content,e);

			$(that).trigger("wchange",[tab_id, tab_content]);
			if(that.onchange)
				that.onchange( tab_id, tab_content );
		}

		//change afterwards in case the user wants to know the previous one
		that.selected = tab_id;
	}

	Tabs.prototype.selectTab = function( id, skip_events )
	{
		if(!id)
			return;

		if(typeof(id) != "string")
			id = id.id; //in case id is the object referencing the tab

		var tabs = this.list.querySelectorAll("li.wtab");
		for(var i = 0; i < tabs.length; i++)
			if( id == tabs[i].dataset["id"] )
			{
				this.onTabClicked.call( tabs[i], !skip_events );
				break;
			}
	}

	Tabs.prototype.setTabVisibility = function(id, v)
	{
		var tab = this.tabs[id];
		if(!tab)
			return;

		tab.tab.style.display = v ? "none" : null;
		tab.content.style.display = v ? "none" : null;
	}

	Tabs.prototype.removeTab = function(id)
	{
		var tab = this.tabs[id];
		if(!tab)
			return;

		if(tab.onclose)
			tab.onclose(tab);

		tab.tab.parentNode.removeChild( tab.tab );
		tab.content.parentNode.removeChild( tab.content );
		delete this.tabs[id];
	}

	Tabs.prototype.removeAllTabs = function()
	{
		var tabs = [];
		for(var i in this.tabs)
			tabs.push( this.tabs[i] );

		for(var i in tabs)
		{
			var tab = tabs[i];
			tab.tab.parentNode.removeChild( tab.tab );
			tab.content.parentNode.removeChild( tab.content );
			delete this.tabs[ tab.id ];
		}

		this.tabs = {};
	}

	Tabs.prototype.hideTab = function(id)
	{
		this.setTabVisibility(id, false);
	}

	Tabs.prototype.showTab = function(id)
	{
		this.setTabVisibility(id, true);
	}

	Tabs.prototype.transferTab = function(id, target_tabs, index)
	{
		var tab = this.tabs[id];
		if(!tab)
			return;

		target_tabs.tabs[id] = tab;

		if(index !== undefined)
			target_tabs.list.insertBefore(tab.tab, target_tabs.list.childNodes[index]);
		else
			target_tabs.list.appendChild(tab.tab);
		target_tabs.root.appendChild(tab.content);
		delete this.tabs[id];

		var newtab = null;
		for(var i in this.tabs)
		{
			newtab = i;
			break;
		}

		if(newtab)
			this.selectTab(newtab);

		tab.tab.classList.remove("selected");
		target_tabs.selectTab(id);
	}

	Tabs.prototype.detachTab = function(id, on_complete, on_close )
	{
		var tab = this.tabs[id];
		if(!tab)
			return;

		var index = this.getTabIndex( id );

		//create window
		var w = 800;
		var h = 600;
		var tab_window = window.open("","","width="+w+", height="+h+", location=no, status=no, menubar=no, titlebar=no, fullscreen=yes");
		tab_window.document.write( "<head><title>"+id+"</title>" );

		//transfer style
		var styles = document.querySelectorAll("link[rel='stylesheet'],style");
		for(var i = 0; i < styles.length; i++)
			tab_window.document.write( styles[i].outerHTML );
		tab_window.document.write( "</head><body></body>" );
		tab_window.document.close();

		var that = this;

		//transfer content after a while so the window is propertly created
		var newtabs = new LiteGUI.Tabs(null, this.options );
		tab_window.tabs = newtabs;

		//closing event
		tab_window.onbeforeunload = function(){
			newtabs.transferTab( id, that, index);
			if(on_close)
				on_close();
		}

		//move the content there
		newtabs.list.style.height = "20px";
		tab_window.document.body.appendChild(newtabs.root);
		that.transferTab(id, newtabs);
		newtabs.tabs[id].tab.classList.add("selected");

		if(on_complete)
			on_complete();

		return tab_window;
	}


	LiteGUI.Tabs = Tabs;
})();
(function(){

	/***** DRAGGER **********/
	function Dragger(value, options)
	{
		options = options || {};
		var element = document.createElement("div");
		element.className = "dragger " + (options.extraclass ? options.extraclass : "");
		this.root = element;

		var wrap = document.createElement("span");
		wrap.className = "inputfield " + (options.extraclass ? options.extraclass : "") + (options.full ? " full" : "");
		if(options.disabled)
		wrap.className += " disabled";
		element.appendChild(wrap);

		var dragger_class = options.dragger_class || "full";

		var input = document.createElement("input");
		input.className = "text number " + (dragger_class ? dragger_class : "");
		input.value = value + (options.units ? options.units : "");
		input.tabIndex = options.tab_index;
		this.input = input;
		element.input = input;

		if(options.disabled)
			input.disabled = true;
		if(options.tab_index)
			input.tabIndex = options.tab_index;
		wrap.appendChild(input);

		this.setValue = function(v) { 
			$(input).val(v).trigger("change");
		}
		
		$(input).bind("keydown",function(e) {
			if(e.keyCode == 38)
				inner_inc(1,e);
			else if(e.keyCode == 40)
				inner_inc(-1,e);
			else
				return;
			e.stopPropagation();
			e.preventDefault();
			return true;
		});

		var dragger = document.createElement("div");
		dragger.className = "drag_widget";
		if(options.disabled)
			dragger.className += " disabled";

		wrap.appendChild(dragger);
		element.dragger = dragger;

		$(dragger).bind("mousedown",inner_down);

		function inner_down(e)
		{
			$(document).unbind("mousemove", inner_move);
			$(document).unbind("mouseup", inner_up);

			if(!options.disabled)
			{
				$(document).bind("mousemove", inner_move);
				$(document).bind("mouseup", inner_up);

				dragger.data = [e.screenX, e.screenY];

				$(element).trigger("start_dragging");
			}

			e.stopPropagation();
			e.preventDefault();
		}

		function inner_move(e)
		{
			var diff = [e.screenX - dragger.data[0], dragger.data[1] - e.screenY];

			dragger.data = [e.screenX, e.screenY];
			var axis = options.horizontal ? 0 : 1;
			inner_inc(diff[axis],e);

			e.stopPropagation();
			e.preventDefault();
			return false;
		};

		function inner_up(e)
		{
			$(element).trigger("stop_dragging");
			$(document).unbind("mousemove", inner_move);
			$(document).unbind("mouseup", inner_up);
			$(dragger).trigger("blur");
			e.stopPropagation();
			e.preventDefault();
			return false;
		};

		function inner_inc(v,e)
		{
			var scale = (options.step ? options.step : 1.0);
			if(e && e.shiftKey)
				scale *= 10;
			else if(e && e.ctrlKey)
				scale *= 0.1;
			var value = parseFloat( input.value ) + v * scale;
			if(options.max != null && value > options.max)
				value = options.max;
			if(options.min != null && value < options.min)
				value = options.min;

			if(options.precision)
				input.value = value.toFixed(options.precision);
			else
				input.value = ((value * 1000)<<0) / 1000; //remove ugly decimals
			if(options.units)
				input.value += options.units;
			$(input).change();
		}
	}
	LiteGUI.Dragger = Dragger;

})();
//enclose in a scope
(function(){


/**
* To create interactive trees (useful for folders or hierarchies)
* data should be in the next structure:
* {
*    id: unique_identifier,
*    content: what to show in the HTML (if omited id will be shown)
*	 children: []  array with another object with the same structure
* }
*
* @class Tree
* @constructor
*/

	/*********** LiteTree *****************************/
	function Tree( id, data, options )
	{
		var root = document.createElement("div");
		this.root = root;
		if(id)
			root.id = id;

		root.className = "litetree";
		this.tree = data;
		var that = this;
		options = options || {allow_rename: false, drag: false, allow_multiselection: false};
		this.options = options;

		if(options.height)
			this.root.style.height = typeof(options.height) == "string" ? options.height : Math.round(options.height) + "px";

		//bg click
		root.addEventListener("click", function(e){
			if(e.srcElement != that.root)
				return;

			if(that.onBackgroundClicked)
				that.onBackgroundClicked(e,that);
		});

		//bg click right mouse
		root.addEventListener("contextmenu", function(e) { 
			if(e.button != 2) //right button
				return false;

			if(that.onContextMenu) 
				that.onContextMenu(e);
			e.preventDefault(); 
			return false;
		});


		var root_item = this.createAndInsert(data, options, null);
		root_item.className += " root_item";
		//this.root.appendChild(root_item);
		this.root_item = root_item;
	}

	Tree.INDENT = 20;


	/**
	* update tree with new data (old data will be thrown away)
	* @method updateTree
	* @param {object} data
	*/
	Tree.prototype.updateTree = function(data)
	{
		this.root.innerHTML = "";
		var root_item = this.createAndInsert( data, this.options, null);
		root_item.className += " root_item";
		//this.root.appendChild(root_item);
		this.root_item = root_item;
	}

	/**
	* update tree with new data (old data will be thrown away)
	* @method insertItem
	* @param {object} data
	* @param {string} parent_id
	* @param {number} position index in case you want to add it before the last position
	* @param {object} options
	* @return {DIVElement}
	*/
	Tree.prototype.insertItem = function(data, parent_id, position, options)
	{
		if(!parent_id)
		{
			var root = this.root.childNodes[0];
			if(root)
				parent_id = root.dataset["item_id"];
		}

		var element = this.createAndInsert( data, options, parent_id, position );

		if(parent_id)
			this._updateListBox( this._findElement(parent_id) );


		return element;
	}

	Tree.prototype.createAndInsert = function(data, options, parent_id, element_index )
	{
		//find parent
		var parent_element_index = -1;
		if(parent_id)
			parent_element_index = this._findElementIndex( parent_id );
		else if(parent_id === undefined)
			parent_element_index = 0; //root

		var parent = null;
		var child_level = 0;

		//find level
		if(parent_element_index != -1)
		{
			parent = this.root.childNodes[ parent_element_index ];
			child_level = parseInt( parent.dataset["level"] ) + 1;
		}

		//create
		var element = this.createTreeItem( data, options, child_level );
		element.parent_id = parent_id;

		//insert
		if(parent_element_index == -1)
			this.root.appendChild( element );
		else
			this._insertInside( element, parent_element_index, element_index );

		//children
		if(data.children)
		{
			for(var i = 0; i < data.children.length; ++i)
			{
				this.createAndInsert( data.children[i], options, data.id );
			}
		}

		this._updateListBox( element );

		if(options && options.selected)
			this.markAsSelected( element, true );

		return element;
	}

	//element to add, position of the parent node, position inside children, the depth level
	Tree.prototype._insertInside = function(element, parent_index, offset_index, level )
	{
		var parent = this.root.childNodes[ parent_index ];
		if(!parent)
			throw("No parent node found, index: " + parent_index +", nodes: " + this.root.childNodes.length );

		var parent_level = parseInt( parent.dataset["level"] );
		var child_level = level !== undefined ? level : parent_level + 1;

		var indent = element.querySelector(".indentblock");
		if(indent)
			indent.style.paddingLeft = (child_level * Tree.INDENT ) + "px"; //inner padding
		
		element.dataset["level"] = child_level;

		//under level nodes
		for( var j = parent_index+1; j < this.root.childNodes.length; ++j )
		{
			var new_childNode = this.root.childNodes[j];
			if( !new_childNode.classList || !new_childNode.classList.contains("ltreeitem") )
				continue;
			var current_level = parseInt( new_childNode.dataset["level"] );

			if( current_level == child_level && offset_index)
			{
				offset_index--;
				continue;
			}

			//last position
			if( current_level < child_level || (offset_index === 0 && current_level === child_level) )
			{
				this.root.insertBefore( element, new_childNode );
				return;
			}
		}

		//ended
		this.root.appendChild( element );
	}

	Tree.prototype._findElement = function( id )
	{
		for(var i = 0; i < this.root.childNodes.length; ++i)
		{
			var childNode = this.root.childNodes[i];
			if( !childNode.classList || !childNode.classList.contains("ltreeitem") )
				continue;
			if( childNode.classList.contains("ltreeitem-" + id) )
				return childNode;
		}

		return null;
	}

	Tree.prototype._findElementIndex = function( id )
	{
		for(var i = 0; i < this.root.childNodes.length; ++i)
		{
			var childNode = this.root.childNodes[i];
			if( !childNode.classList || !childNode.classList.contains("ltreeitem") )
				continue;

			if(typeof(id) === "string")
			{
				if(childNode.dataset["item_id"] === id)
					return i;
			}
			else if( childNode === id )
				return i;
		}

		return -1;
	}

	Tree.prototype._findElementLastChildIndex = function( start_index )
	{
		var level = parseInt( this.root.childNodes[ start_index ].dataset["level"] );

		for(var i = start_index+1; i < this.root.childNodes.length; ++i)
		{
			var childNode = this.root.childNodes[i];
			if( !childNode.classList || !childNode.classList.contains("ltreeitem") )
				continue;

			var current_level = parseInt( childNode.dataset["level"] );
			if( current_level == level )
				return i;
		}

		return -1;
	}

	//returns child elements (you can control levels)
	Tree.prototype._findChildElements = function( id, only_direct )
	{
		var parent_index = this._findElementIndex( id );
		if(parent_index == -1)
			return;

		var parent = this.root.childNodes[ parent_index ];
		var parent_level = parseInt( parent.dataset["level"] );

		var result = [];

		for(var i = parent_index + 1; i < this.root.childNodes.length; ++i)
		{
			var childNode = this.root.childNodes[i];
			if( !childNode.classList || !childNode.classList.contains("ltreeitem") )
				continue;

			var current_level = parseInt( childNode.dataset["level"] );
			if(only_direct && current_level > (parent_level + 1) )
				continue;
			if(current_level <= parent_level)
				return result;

			result.push( childNode );
		}

		return result;
	}
	
	Tree.prototype.createTreeItem = function(data, options, level)
	{
		options = options || this.options;

		var root = document.createElement("li");
		root.className = "ltreeitem";
		var that = this;

		//ids are not used because they could collide, classes instead
		if(data.id)
		{
			var safe_id = data.id.replace(/\s/g,"_");
			root.className += " ltreeitem-" + safe_id;
			root.dataset["item_id"] = data.id;
		}

		data.DOM = root; //double link
		root.data = data;

		if(level !== undefined)
			root.dataset["level"] = level;

		var title_element = document.createElement("div");
		title_element.className = "ltreeitemtitle";
		if(data.className)
			title_element.className += " " + data.className;

		title_element.innerHTML = "<span class='precontent'></span><span class='indentblock'></span><span class='collapsebox'></span><span class='incontent'></span><span class='postcontent'></span>";


		var content = data.content || data.id || "";
		title_element.querySelector(".incontent").innerHTML = content;

		if(data.precontent)
			title_element.querySelector(".precontent").innerHTML = data.precontent;

		if(data.dataset)
			for(var i in data.dataset)
				root.dataset[i] = data.dataset[i];

		root.appendChild(title_element);
		root.title_element = title_element;

		if(data.visible === false)
			root.style.display = "none";

		//var row = root.querySelector(".ltreeitemtitle .incontent");
		var row = root;
		row.addEventListener("click", onNodeSelected );
		row.addEventListener("dblclick",onNodeDblClicked );
		row.addEventListener("contextmenu", function(e) { 
			var item = this;
			e.preventDefault(); 
			e.stopPropagation();

			if(e.button != 2) //right button
				return;

			if(that.onItemContextMenu)
				return that.onItemContextMenu(e, { item: item, data: item.data} );

			return false;
		});

		function onNodeSelected(e)
		{
			e.preventDefault();
			e.stopPropagation();

			//var title = this.parentNode;
			//var item = title.parentNode;
			var node = this;
			var title = node.title_element;

			if(title._editing) 
				return;

			if(e.shiftKey && that.options.allow_multiselection)
			{
				//check if selected
				if( that.isNodeSelected( node ) )
				{
					node.title_element.classList.remove("selected");
					LiteGUI.trigger(that.root, "item_remove_from_selection", { item: node, data: node.data} );
					return;
				}

				//mark as selected
				that.markAsSelected( node, true );

				LiteGUI.trigger(that.root, "item_add_to_selection", { item: node, data: node.data} );
				var r = false;
				if(data.callback) 
					r = data.callback.call(that,node);

				if(!r && that.onItemAddToSelection)
					that.onItemAddToSelection(node.data, node);
			}
			else
			{
				//mark as selected
				that.markAsSelected( node );

				that._skip_scroll = true; //avoid scrolling while user clicks something
				LiteGUI.trigger(that.root, "item_selected", { item: node, data: node.data} );
				var r = false;
				if(data.callback) 
					r = data.callback.call(that,node);

				if(!r && that.onItemSelected)
					that.onItemSelected(node.data, node);
				that._skip_scroll = false;
			}
		}

		function onNodeDblClicked(e)
		{
			var node = this; //this.parentNode;
			var title = node.title_element.querySelector(".incontent");

			LiteGUI.trigger( that.root, "item_dblclicked", node );

			if(!title._editing && that.options.allow_rename)
			{
				title._editing = true;
				title._old_name = title.innerHTML;
				var that2 = title;
				title.innerHTML = "<input type='text' value='" + title.innerHTML + "' />";
				var input = title.querySelector("input");

				//loose focus when renaming
				$(input).blur(function(e) { 
					var new_name = e.target.value;
					setTimeout(function() { that2.innerHTML = new_name; },1); //bug fix, if I destroy input inside the event, it produce a NotFoundError
					//item.node_name = new_name;
					delete that2._editing;
					LiteGUI.trigger( that.root, "item_renamed", { old_name: that2._old_name, new_name: new_name, item: node, data: node.data } );
					delete that2._old_name;
				});

				//finishes renaming
				input.addEventListener("keydown", function(e) {
					if(e.keyCode != 13)
						return;
					$(this).blur();
				});

				//set on focus
				$(input).focus();

				e.preventDefault();
			}
			
			e.preventDefault();
			e.stopPropagation();
		}

		//dragging tree
		var draggable_element = title_element;
		draggable_element.draggable = true;

		//starts dragging this element
		draggable_element.addEventListener("dragstart", function(ev) {
			//this.removeEventListener("dragover", on_drag_over ); //avoid being drag on top of himself
			//ev.dataTransfer.setData("node-id", this.parentNode.id);
			ev.dataTransfer.setData("item_id", this.parentNode.dataset["item_id"]);
		});

		//something being dragged entered
		draggable_element.addEventListener("dragenter", function (ev)
		{
			ev.preventDefault();
			if(data.skipdrag)
				return false;

			title_element.classList.add("dragover");
		});

		draggable_element.addEventListener("dragleave", function (ev)
		{
			ev.preventDefault();
			//console.log(data.id);
			title_element.classList.remove("dragover");
			//if(ev.srcElement == this) return;
		});

		//test if allows to drag stuff on top?
		draggable_element.addEventListener("dragover", on_drag_over );
		function on_drag_over(ev)
		{
			ev.preventDefault();
		}

		draggable_element.addEventListener("drop", function (ev)
		{
			$(title_element).removeClass("dragover");
			ev.preventDefault();
			if(data.skipdrag)
				return false;

			var item_id = ev.dataTransfer.getData("item_id");

			//var data = ev.dataTransfer.getData("Text");
			if(!item_id)
			{
				LiteGUI.trigger( that.root, "drop_on_item", { item: this, event: ev });
				return;
			}

			//try
			{
				var parent_id = this.parentNode.dataset["item_id"];

				if( !that.onMoveItem || (that.onMoveItem && that.onMoveItem( that.getItem( item_id ), that.getItem( parent_id ) ) != false))
				{
					if( that.moveItem( item_id, parent_id ) )
						LiteGUI.trigger( that.root, "item_moved", { item: that.getItem( item_id ), parent_item: that.getItem( parent_id ) } );
				}
			}
			/*
			catch (err)
			{
				console.error("Error: " + err );
			}
			*/
		});

		return root;
	}

	Tree.prototype.filterByName = function(name)
	{
		for(var i = 0; i < this.root.childNodes.length; ++i)
		{
			var childNode = this.root.childNodes[i]; //ltreeitem
			if( !childNode.classList || !childNode.classList.contains("ltreeitem") )
				continue;

			var content = childNode.querySelector(".incontent");
			if(!content)
				continue;

			var str = content.innerHTML.toLowerCase();

			if(!name || str.indexOf( name.toLowerCase() ) != -1)
			{
				if( childNode.data && childNode.data.visible !== false )
					childNode.style.display = null;
				var indent = childNode.querySelector(".indentblock");
				if(indent)
				{
					if(name)
						indent.style.paddingLeft = 0;
					else
						indent.style.paddingLeft = paddingLeft = (parseInt(childNode.dataset["level"]) * Tree.INDENT) + "px";
				}
			}
			else
			{
				childNode.style.display = "none";
			}
		}

		/*
		var all = this.root.querySelectorAll(".ltreeitemtitle .incontent");
		for(var i = 0; i < all.length; i++)
		{
			var element = all[i];
			if(!element)
				continue;

			var str = element.innerHTML;
			var parent = element.parentNode;

			if(!name || str.indexOf(name) != -1)
			{
				parent.style.display = null;
				parent.parentNode.style.paddingLeft = (parseInt(parent.parentNode.dataset["level"]) * Tree.INDENT) + "px";
			}
			else
			{
				parent.style.display = "none";
				parent.parentNode.style.paddingLeft = 0;
			}
		}
		*/
	}	

	/**
	* get the item with that id, returns the HTML element
	* @method getItem
	* @param {string} id
	* @return {Object}
	*/
	Tree.prototype.getItem = function( id )
	{
		if(!id)
			return null;

		if( id.classList )
			return id;

		for(var i = 0; i < this.root.childNodes.length; ++i)
		{
			var childNode = this.root.childNodes[i];
			if( !childNode.classList || !childNode.classList.contains("ltreeitem") )
				continue;

			if(childNode.dataset["item_id"] === id)
				return childNode;
		}

		return null;

		/*
		var safe_id = id.replace(/\s/g,"_");
		var node = this.root.querySelector(".ltreeitem-"+safe_id);
		if(!node) 
			return null;
		if( !node.classList.contains("ltreeitem") )
			throw("this node is not a tree item");
		return node;
		*/
	}

	/**
	* in case an item is collapsed, it expands it to show children
	* @method expandItem
	* @param {string} id
	*/
	Tree.prototype.expandItem = function(id)
	{
		var item = this.getItem(id);
		if(!item)
			return;

		if(!item.listbox)
			return;

		listbox.setValue(true);
	}

	/**
	* in case an item is expanded, it collapses it to hide children
	* @method collapseItem
	* @param {string} id
	*/
	Tree.prototype.collapseItem = function(id)
	{
		var item = this.getItem(id);
		if(!item)
			return;

		if(!item.listbox)
			return;

		listbox.setValue(false);
	}


	/**
	* Tells you if the item its out of the view due to the scrolling
	* @method isInsideArea
	* @param {string} id
	*/
	Tree.prototype.isInsideArea = function( id )
	{
		var item = id.constructor === String ? this.getItem(id) : id;
		if(!item)
			return false;

		var rects = this.root.getClientRects();
		if(!rects.length)
			return false;
		var r = rects[0];
		var h = r.height;
		var y = item.offsetTop;

		if( this.root.scrollTop < y && y < (this.root.scrollTop + h) )
			return true;
		return false;
	}

	/**
	* Scrolls to center this item
	* @method scrollToItem
	* @param {string} id
	*/
	Tree.prototype.scrollToItem = function(id)
	{
		var item = id.constructor === String ? this.getItem(id) : id;
		if(!item)
			return;

		var rects = this.root.getClientRects();
		if(!rects.length)
			return false;
		var r = rects[0];
		var h = r.height;
		var x = parseInt( item.dataset["level"] ) * Tree.INDENT + 50;

		this.root.scrollTop = item.offsetTop - (h * 0.5)|0;
		if( r.width * 0.75 < x )
			this.root.scrollLeft = x;
		else
			this.root.scrollLeft = 0;
	}

	/**
	* mark item as selected
	* @method setSelectedItem
	* @param {string} id
	*/
	Tree.prototype.setSelectedItem = function( id, scroll )
	{
		if(!id)
		{
			//clear selection
			this.unmarkAllAsSelected();
			return;
		}

		var node = this.getItem(id);
		if(!node) //not found
			return null;

		//already selected
		if( node.classList.contains("selected") ) 
			return;

		this.markAsSelected(node);
		if( scroll && !this._skip_scroll )
			this.scrollToItem(node);

		return node;
	}

	/**
	* adds item to selection (multiple selection)
	* @method addItemToSelection
	* @param {string} id
	*/
	Tree.prototype.addItemToSelection = function( id )
	{
		if(!id)
			return;

		var node = this.getItem(id);
		if(!node) //not found
			return null;

		this.markAsSelected(node, true);
		return node;
	}

	/**
	* remove item from selection (multiple selection)
	* @method removeItemFromSelection
	* @param {string} id
	*/
	Tree.prototype.removeItemFromSelection = function( id )
	{
		if(!id)
			return;
		var node = this.getItem(id);
		if(!node) //not found
			return null;
		node.title_element.classList.remove("selected");
	}

	/**
	* returns the first selected item (its HTML element)
	* @method getSelectedItem
	* @return {HTML}
	*/
	Tree.prototype.getSelectedItem = function()
	{
		return this.root.querySelector(".ltreeitemtitle.selected");
	}

	/**
	* returns an array with the selected items (its HTML elements)
	* @method getSelectedItems
	* @return {HTML}
	*/
	Tree.prototype.getSelectedItems = function()
	{
		return this.root.querySelectorAll(".ltreeitemtitle.selected");
	}

	/**
	* returns if an item is selected
	* @method isItemSelected
	* @param {string} id
	* @return {bool}
	*/
	Tree.prototype.isItemSelected = function(id)
	{
		var node = this.getItem( id );
		if(!node)
			return false;
		return this.isNodeSelected(node);
	}

	/**
	* returns the children of an item
	* @method getChildren
	* @param {string} id
	* @param {bool} [only_direct=false] to get only direct children
	* @return {Array}
	*/
	Tree.prototype.getChildren = function(id, only_direct )
	{
		return this._findChildElements( id, only_direct );
	}

	/**
	* returns the parent of a item
	* @method getParent
	* @param {string} id
	* @return {HTML}
	*/
	Tree.prototype.getParent = function(id_or_node)
	{
		var element = this.getItem( id_or_node );
		if(element)
			return this.getItem( element.parent_id );
		return null;
	}

	/**
	* move item with id to be child of parent_id
	* @method moveItem
	* @param {string} id
	* @param {string} parent_id
	* @return {bool}
	*/
	Tree.prototype.moveItem = function(id, parent_id )
	{
		if(id === parent_id)
			return;

		var node = this.getItem( id );
		var parent = this.getItem( parent_id );
		var parent_index = this._findElementIndex( parent );
		var parent_level = parseInt( parent.dataset["level"] );
		var old_parent = this.getParent( node );
		var old_parent_level = parseInt( old_parent.dataset["level"] );
		var level_offset = parent_level - old_parent_level;

		if(!parent || !node)
			return false;

		if(parent == old_parent)
			return;

		//replace parent info
		node.parent_id = parent_id;

		//get all children and subchildren
		var children = this.getChildren( node );
		children.unshift(node); //add the node at the beginning

		//remove all children
		for(var i = 0; i < children.length; i++)
			children[i].parentNode.removeChild( children[i] );

		//update levels
		for(var i = 0; i < children.length; i++)
		{
			var child = children[i];
			var new_level = parseInt(child.dataset["level"]) + level_offset;
			child.dataset["level"] = new_level;
		}

		//reinsert
		parent_index = this._findElementIndex( parent ); //update parent index
		var last_index = this._findElementLastChildIndex( parent_index );
		if(last_index == -1)
			last_index = 0;
		for(var i = 0; i < children.length; i++)
		{
			var child = children[i];
			this._insertInside( child, parent_index, last_index + i - 1, parseInt( child.dataset["level"] ) );
		}
		
		this._updateListBox( parent );
		if(old_parent)
			this._updateListBox( old_parent );

		return true;
	}

	/**
	* remove item with given id
	* @method removeItem
	* @param {string} id
	* @return {bool}
	*/
	Tree.prototype.removeItem = function(id_or_node)
	{
		var node = id_or_node;
		if(typeof(id_or_node) == "string")
			node = this.getItem(id_or_node);
		if(!node)
			return false;

		var parent = this.getParent(node);
		this.root.removeChild( node );

		if(parent)
			this._updateListBox(parent);
		return true;
	}

	/**
	* update a given item with new data
	* @method updateItem
	* @param {string} id
	* @param {object} data
	*/
	Tree.prototype.updateItem = function(id, data)
	{
		var node = this.getItem(id);
		if(!node)
			return;

		node.data = data;
		if(data.id)
			node.id = data.id;
		if(data.content)
		{
			//node.title_element.innerHTML = "<span class='precontent'></span><span class='incontent'>" +  + "</span><span class='postcontent'></span>";
			var incontent = node.title_element.querySelector(".incontent");
			incontent.innerHTML = data.content;
		}
	}

	/**
	* clears all the items
	* @method clear
	* @param {bool} keep_root if you want to keep the root item
	*/
	Tree.prototype.clear = function(keep_root)
	{
		if(!keep_root)
		{
			this.root.innerHTML = "";
			return;
		}

		var items = this.root.querySelectorAll(".ltreeitem");
		for(var i = 1; i < items.length; i++)
		{
			var item = items[i];
			this.root.removeChild( item );
		}
	}


	Tree.prototype.getNodeByIndex = function(index)
	{
		var items = this.root.querySelectorAll(".ltreeitem");
		return items[index];
	}

	//private ********************************

	Tree.prototype.unmarkAllAsSelected = function()
	{
		this.root.classList.remove("selected");
		var selected_array = this.root.querySelectorAll(".ltreeitemtitle.selected");
		if(selected_array)
		{
			for(var i = 0; i < selected_array.length; i++)
				selected_array[i].classList.remove("selected");
		}
		var semiselected = this.root.querySelectorAll(".ltreeitemtitle.semiselected");
		for(var i = 0; i < semiselected.length; i++)
			semiselected[i].classList.remove("semiselected");
	}

	Tree.prototype.isNodeSelected = function( node )
	{
		//already selected
		if( node.classList.contains("selected") ) 
			return true;
		return false;
	}

	Tree.prototype.markAsSelected = function( node, add_to_existing_selection )
	{
		//already selected
		if( node.classList.contains("selected") ) 
			return;

		//clear old selection
		if(!add_to_existing_selection)
			this.unmarkAllAsSelected();

		//mark as selected
		node.title_element.classList.add("selected");

		//go up and semiselect
		var parent = node.parentNode.parentNode; //two elements per level
		while(parent && parent.classList.contains("ltreeitem"))
		{
			parent.title_element.classList.add("semiselected");
			parent = parent.parentNode.parentNode;
		}
	}

	Tree.prototype._updateListBox = function( node )
	{
		if(!node)
			return;

		var that = this;

		if(!node.listbox)
		{
			var pre = node.title_element.querySelector(".collapsebox");
			var box = LiteGUI.createLitebox(true, function(e) { that.onClickBox(e, node); });
			box.stopPropagation = true;
			box.setEmpty(true);
			pre.appendChild(box);
			node.listbox = box;
		}

		var child_elements = this.getChildren( node.dataset["item_id"] );
		if(!child_elements)
			return; //null

		if(child_elements.length)
			node.listbox.setEmpty(false);
		else
			node.listbox.setEmpty(true);
	}

	Tree.prototype.onClickBox = function(e, node)
	{
		var children = this.getChildren( node );
		var status = node.listbox.getValue();

		for(var i = 0; i < children.length; ++i)
			children[i].style.display = status == "open" ? null : "none";
	}

	LiteGUI.Tree = Tree;
})();
//enclose in a scope
(function(){
	
	/****************** PANEL **************/
	function Panel(id, options)
	{
		options = options || {};
		this._ctor(id,options);
	}

	Panel.title_height = "20px";

	Panel.prototype._ctor = function(id, options)
	{
		this.content = options.content || "";

		var root = this.root = document.createElement("div");
		if(id)
			root.id = id;

		root.className = "litepanel " + (options.className || "");
		root.data = this;

		var code = "";
		if(options.title)
			code += "<div class='panel-header'>"+options.title+"</div>";
		code += "<div class='content'>"+this.content+"</div>";
		code += "<div class='panel-footer'></div>";
		root.innerHTML = code;

		if(options.title)
			this.header = this.root.querySelector(".panel-header");

		this.content = this.root.querySelector(".content");
		this.footer = this.root.querySelector(".panel-footer");

		//if(options.scroll == false)	this.content.style.overflow = "hidden";
		if(options.scroll == true)	this.content.style.overflow = "auto";
	}

	Panel.prototype.add = function( litegui_item )
	{
		this.content.appendChild( litegui_item.root );
	}

	/****************** DIALOG **********************/
	/**
	* Dialog
	*
	* @class Dialog
	* @param {string} id
	* @param {Object} options useful options are { title, width, height, closable, on_close, }
	* @constructor
	*/
	function Dialog(id, options)
	{
		this._ctor( id, options );
	}

	Dialog.MINIMIZED_WIDTH = 200;
	Dialog.title_height = "20px";

	Dialog.getDialog = function(id)
	{
		var element = document.getElementById(id);		
		if(!element)
			return null;
		return element.dialog;
	}

	Dialog.prototype._ctor = function(id, options)
	{
		this.width = options.width;
		this.height = options.height;
		this.minWidth = options.minWidth || 150;
		this.minHeight = options.minHeight || 100;
		this.content = options.content || "";

		var panel = document.createElement("div");
		if(id)
			panel.id = id;

		panel.className = "litedialog " + (options.className || "");
		panel.data = this;
		panel.dialog = this;

		var code = "";
		if(options.title)
		{
			code += "<div class='panel-header'>"+options.title+"</div><div class='buttons'>";
			if(options.minimize){
				code += "<button class='mini-button minimize-button'>-</button>";
				code += "<button class='mini-button maximize-button' style='display:none'></button>";
			}
			if(options.hide)
				code += "<button class='mini-button hide-button'></button>";
			
			if(options.close || options.closable)
				code += "<button class='mini-button close-button'>"+ LiteGUI.special_codes.close +"</button>";
			code += "</div>";
		}

		code += "<div class='content'>"+this.content+"</div>";
		code += "<div class='panel-footer'></div>";
		panel.innerHTML = code;

		this.root = panel;
		this.content = panel.querySelector(".content");
		this.footer = panel.querySelector(".panel-footer");

		if(options.fullcontent)
		{
			this.content.style.width = "100%";		
			this.content.style.height = "100%";		
		}

		if(options.buttons)
		{
			for(var i in options.buttons)
				this.addButton(options.buttons[i].name, options.buttons[i]);
		}

		//if(options.scroll == false)	this.content.style.overflow = "hidden";
		if(options.scroll == true)
			this.content.style.overflow = "auto";

		//buttons *********************************
		var close_button = panel.querySelector(".close-button");
		if(close_button)
			close_button.addEventListener("click", this.close.bind(this) );

		var maximize_button = panel.querySelector(".maximize-button");
		if(maximize_button)
			maximize_button.addEventListener("click", this.maximize.bind(this) );

		var minimize_button = panel.querySelector(".minimize-button");
		if(minimize_button)
			minimize_button.addEventListener("click", this.minimize.bind(this) );

		var hide_button = panel.querySelector(".hide-button");
		if(hide_button)
			hide_button.addEventListener("click", this.hide.bind(this) );

		this.makeDialog(options);
	}

	/**
	* add widget or html to the content of the dialog
	* @method add
	*/
	Dialog.prototype.add = function( litegui_item )
	{
		this.content.appendChild( litegui_item.root || litegui_item );
	}

	Dialog.prototype.makeDialog = function(options)
	{
		options = options || {};

		var panel = this.root;
		panel.style.position = "absolute";
		//panel.style.display = "none";

		panel.style.minWidth = this.minWidth + "px";
		panel.style.minHeight = this.minHeight + "px";

		if(this.width)
			panel.style.width = this.width + "px";

		if(this.height)
		{
			if(typeof(this.height) == "number")
			{
				panel.style.height = this.height + "px";
			}
			else
			{
				if(this.height.indexOf("%") != -1)
					panel.style.height = this.height;
			}

			this.content.style.height = "calc( " + this.height + " - 24px )";
		}

		panel.style.boxShadow = "0 0 3px black";

		if(options.draggable)
		{
			this.draggable = true;
			LiteGUI.draggable( panel, panel.querySelector(".panel-header") );
		}

		if(options.resizable)
			this.setResizable();

		var parent = null;
		if(options.parent)
			parent = typeof(options.parent) == "string" ? document.querySelector(options.parent) : options.parent;

		if(!parent)
			parent = LiteGUI.root;

		parent.appendChild( this.root );
		this.center();
	}

	Dialog.prototype.setResizable = function()
	{
		if(this.resizable) return;

		var root = this.root;
		this.resizable = true;
		var footer = this.footer;
		footer.style.minHeight = "4px";
		footer.classList.add("resizable");

		footer.addEventListener("mousedown", inner_mouse);

		var mouse = [0,0];
		var that = this;

		function inner_mouse(e)
		{
			if(e.type == "mousedown")
			{
				document.body.addEventListener("mousemove", inner_mouse);
				document.body.addEventListener("mouseup", inner_mouse);
				mouse[0] = e.pageX;
				mouse[1] = e.pageY;
			}
			else if(e.type == "mousemove")
			{
				var h = $(root).height();
				var newh = h - (mouse[1] - e.pageY);
				$(root).height(newh + "px");
				mouse[0] = e.pageX;
				mouse[1] = e.pageY;
				that.content.style.height = "calc( 100% - 24px )";
			}
			else if(e.type == "mouseup")
			{
				document.body.removeEventListener("mousemove", inner_mouse);
				document.body.removeEventListener("mouseup", inner_mouse);
			}
			e.preventDefault();
			return false;
		}
	}

	Dialog.prototype.dockTo = function(parent, dock_type)
	{
		if(!parent) return;
		var panel = this.root;

		dock_type = dock_type || "full";
		parent = parent.content || parent;

		panel.style.top = 0;
		panel.style.left = 0;

		panel.style.boxShadow = "0 0 0";

		if(dock_type == "full")
		{
			panel.style.position = "relative";
			panel.style.width = "100%";
			panel.style.height = "100%";
			this.content.style.width = "100%";
			this.content.style.height = "calc(100% - "+ LiteGUI.Panel.title_height +")"; //title offset: 20px
			this.content.style.height = "-moz-calc(100% - "+ LiteGUI.Panel.title_height +")";
			this.content.style.height = "-webkit-calc(100% - "+ LiteGUI.Panel.title_height +")"; 
			this.content.style.overflow = "auto";
		}
		else if(dock_type == 'left' || dock_type == 'right')
		{
			panel.style.position = "absolute";
			panel.style.top = 0;
			panel.style[dock_type] = 0;

			panel.style.width = this.width + "px";
			panel.style.height = "100%";

			this.content.style.height = "-moz-calc(100% - "+ LiteGUI.Panel.title_height +")";
			this.content.style.height = "-webkit-calc(100% - "+ LiteGUI.Panel.title_height +")";
			this.content.style.height = "calc(100% - "+ LiteGUI.Panel.title_height +")";
			this.content.style.overflow = "auto";

			if(dock_type == 'right')
			{
				panel.style.left = "auto";
				panel.style.right = 0;
			}
		}
		else if(dock_type == 'bottom' || dock_type == 'top')
		{
			panel.style.width = "100%";
			panel.style.height = this.height + "px";
			if(dock_type == 'bottom')
			{
				panel.style.bottom = 0;
				panel.style.top = "auto";
			}
		}

		if(this.draggable)
			$(panel).draggable({disabled: true});

		if(parent.content)
			parent.content.appendChild(panel);
		else if( typeof(parent) == "string")
		{
			parent = document.querySelector( parent );
			if(parent)
				parent.appendChild( panel )
		}
		else
			parent.appendChild( panel ); 
	}

	Dialog.prototype.addButton = function(name,options)
	{
		var that = this;
		var button = document.createElement("button");

		button.innerHTML = name;
		if(options.className) button.className = options.className;

		this.root.querySelector(".panel-footer").appendChild( button );

		button.addEventListener("click", function(e) { 
			if(options.callback)
				options.callback(this);

			if(options.close)
				that.close();
		});

		return button;
	}

	/**
	* destroys the dialog
	* @method close
	*/
	Dialog.prototype.close = function() {
		LiteGUI.remove( this );
		LiteGUI.trigger( this, "closed", this);
		if(this.on_close)
			this.on_close();
		if(this.onclose)
			console.warn("Dialog: Do not use onclose, use on_close instead");
	}

	Dialog.prototype.highlight = function(time)
	{
		time = time || 100;
		this.root.style.outline = "1px solid white";
		setTimeout( (function(){
			this.root.style.outline = null;
		}).bind(this), time );
	}

	Dialog.minimized = [];

	Dialog.prototype.minimize = function() {
		if(this.minimized) return;

		this.minimized = true;
		this.old_pos = $(this.root).position();

		this.root.querySelector(".content").style.display = "none";
		
		var minimize_button = this.root.querySelector(".minimize-button");
		if(minimize_button)	
			minimize_button.style.display = "none";

		var maximize_button = this.root.querySelector(".maximize-button");
		if(maximize_button)
			maximize_button.style.display = null;

		this.root.style.width = LiteGUI.Dialog.MINIMIZED_WIDTH + "px";

		LiteGUI.bind( this, "closed", function() {
			LiteGUI.Dialog.minimized.splice( LiteGUI.Dialog.minimized.indexOf( this ), 1);
			LiteGUI.Dialog.arrangeMinimized();
		});

		LiteGUI.Dialog.minimized.push( this );
		LiteGUI.Dialog.arrangeMinimized();

		LiteGUI.trigger( this,"minimizing" );
	}

	Dialog.arrangeMinimized = function()
	{
		for(var i in LiteGUI.Dialog.minimized)
		{
			var dialog = LiteGUI.Dialog.minimized[i];
			var parent = dialog.root.parentNode;
			var pos = $(parent).height() - 20;
			$(dialog.root).animate({ left: LiteGUI.Dialog.MINIMIZED_WIDTH * i, top: pos + "px" },100);
		}
	}

	Dialog.prototype.maximize = function() {
		if(!this.minimized)
			return;
		this.minimized = false;

		this.root.querySelector(".content").style.display = null;
		$(this.root).draggable({ disabled: false });
		$(this.root).animate({ left: this.old_pos.left+"px" , top: this.old_pos.top + "px", width: this.width },100);

		var minimize_button = this.root.querySelector(".minimize-button");
		if(minimize_button)
			minimize_button.style.display = null;

		var maximize_button = this.root.querySelector(".maximize-button");
		if(maximize_button)
			maximize_button.style.display = "none";

		LiteGUI.Dialog.minimized.splice( LiteGUI.Dialog.minimized.indexOf( this ), 1);
		LiteGUI.Dialog.arrangeMinimized();
		LiteGUI.trigger( this, "maximizing" );
	}

	Dialog.prototype.makeModal = function()
	{
		LiteGUI.showModalBackground(true);
		LiteGUI.modalbg_div.appendChild( this.root ); //add panel
		//$(this.root).draggable({ disabled: true });
		this.show();
		this.center();

		LiteGUI.bind( this, "closed", inner );

		function inner(e)
		{
			LiteGUI.showModalBackground(false);
		}
	}

	Dialog.prototype.bringToFront = function()
	{
		var parent = this.root.parentNode;
		parent.detach(this.root);
		parent.attach(this.root);
	}

	/**
	* shows a hidden dialog
	* @method show
	*/
	Dialog.prototype.show = function(v,callback)
	{
		if(!this.root.parentNode)
			LiteGUI.add( this );

		//$(this.root).show(v,null,100,callback);
		this.root.style.display = null;
		LiteGUI.trigger( this, "shown" );
	}

	/**
	* hides the dialog
	* @method hide
	*/
	Dialog.prototype.hide = function(v,callback)
	{
		this.root.style.display = "none";
		LiteGUI.trigger(this, "hidden");
	}

	Dialog.prototype.setPosition = function(x,y)
	{
		this.root.position = "absolute";
		this.root.style.left = x + "px";
		this.root.style.top = y + "px";
	}

	Dialog.prototype.setSize = function( w, h )
	{
		this.root.style.width = typeof(w) == "number" ? w + "px" : w;
		this.root.style.height = typeof(h) == "number" ? h + "px" : h;
	}

	Dialog.prototype.setTitle = function(text)
	{
		if(!this.header)
			return;
		this.header.innerHTML = text;
	}

	Dialog.prototype.center = function()
	{
		if(!this.root.parentNode)
			return;

		this.root.position = "absolute";
		var width = this.root.offsetWidth;
		var height = this.root.offsetHeight;
		var parent_width = this.root.parentNode.offsetWidth;
		var parent_height = this.root.parentNode.offsetHeight;
		this.root.style.left = Math.floor(( parent_width - width ) * 0.5) + "px";
		this.root.style.top = Math.floor(( parent_height - height ) * 0.5) + "px";
	}

	/**
	* Adjust the size of the dialog to the size of the content
	* @method adjustSize
	* @param {number} margin
	*/
	Dialog.prototype.adjustSize = function( margin, skip_timeout )
	{
		margin = margin || 0;
		this.content.style.height = "auto";

		if(this.content.offsetHeight == 0 && !skip_timeout) //happens sometimes if the dialog is not yet visible
		{
			var that = this;
			setTimeout( function(){ that.adjustSize( margin, true ); }, 1 );
			return;
		}

		var width = this.content.offsetWidth;
		var height = this.content.offsetHeight + 20 + margin;

		this.setSize( width, height );
	}

	Dialog.prototype.clear = function()
	{
		this.content.innerHTML = "";
	}

	Dialog.showAll = function()
	{
		var dialogs = document.body.querySelectorAll("litedialog");
		for(var i = 0; i < dialogs.length; i++)
		{
			var dialog = dialogs[i];
			dialog.dialog.show();
		}
	}

	Dialog.hideAll = function()
	{
		var dialogs = document.body.querySelectorAll("litedialog");
		for(var i = 0; i < dialogs.length; i++)
		{
			var dialog = dialogs[i];
			dialog.dialog.hide();
		}
	}

	Dialog.closeAll = function()
	{
		var dialogs = document.body.querySelectorAll("litedialog");
		for(var i = 0; i < dialogs.length; i++)
		{
			var dialog = dialogs[i];
			dialog.dialog.close();
		}
	}


	LiteGUI.Panel = Panel;
	LiteGUI.Dialog = Dialog;
})();
/* Attributes editor panel 
	Dependencies: 
		- jQuery
		- jQuery UI (sliders)
		- jscolor.js
*/

/* LiteWiget options:
	+ name_width: the width of the widget name area

*/

jQuery.fn.wchange = function(callback) {
	$(this[0]).on("wchange",callback);
};

jQuery.fn.wclick = function(callback) {
	$(this[0]).on("wclick",callback);
};

/**
* Inspector allows to create a list of widgets easily
*
* @class Inspector
* @param {string} id
* @param {Object} options useful options are { width, widgets_width, name_width, full, widgets_per_row }
* @constructor
*/

function Inspector(id,options)
{
	options = options || {};
	this.root = document.createElement("DIV");
	this.root.className = "inspector " + ( options.full ? "full" : "");
	if(options.one_line)
	{
		this.one_line = true;
		this.root.className += " one_line";
	}

	if(id)
		this.root.id = id;

	this.values = {};
	this.sections = [];
	this.widgets = {};

	this.addSection();
	this.tab_index = Math.floor(Math.random() * 10000);

	if(options.name_width)
		this.name_width = options.name_width;
	if(options.widgets_width)
		this.widgets_width = options.widgets_width;

	if(options.parent) this.appendTo(options.parent);
	this.widgets_per_row = options.widgets_per_row || 1;
}

Inspector.prototype.appendTo = function(parent, at_front)
{
	if(at_front)
		$(parent).prepend(this.root);
	else
		$(parent).append(this.root);
}

/**
* Removes all the widgets inside the inspector
* @method clear
*/
Inspector.prototype.clear = function()
{
	purgeElement( this.root, true ); //hack, but doesnt seem to work
	this.root.innerHTML = "";

	this.sections = [];
	this.values = {};
	this.widgets = {};

	this.current_container = null;
	this._current_container_stack = null;
	this.addSection();
}

/**
* Tryes to refresh (calls on_refresh)
* @method clear
*/
Inspector.prototype.refresh = function()
{
	if(this.on_refresh)
		this.on_refresh();
}

Inspector.prototype.append = function(widget, options)
{
	var root = this.root;
	if( this.current_container )
		root = this.current_container;
	else if( this.current_group_content )
		root = this.current_group_content;
	else if( this.current_section_content )
		root = this.current_section_content;

	if(options && options.replace)
		options.replace.parentNode.replaceChild( widget, options.replace );
	else
		root.appendChild( widget );
}

Inspector.prototype.pushContainer = function( element )
{
	if(!this._current_container_stack)
		this._current_container_stack = [ element ];
	else
		this._current_container_stack.push( element );

	this.current_container = element;
}

Inspector.prototype.popContainer = function()
{
	if(this._current_container_stack && this._current_container_stack.length)
	{
		this._current_container_stack.pop();
		this.current_container = this._current_container_stack[ this._current_container_stack.length - 1 ];
	}
	else
		this.current_container = null;
}

Inspector.prototype.setup = function(info)
{
	for(var i in info)
	{
		var w = info[i];
		var widget = this.add(w.type,w.name,w.value,w.options);
	}
}

/**  Given an instance it shows all the attributes
*
* @method inspectInstance
* @param {Object} instance the instance that you want to inspect, attributes will be collected from this object
* @param {Array} attrs an array with all the names of the properties you want to inspect, 
*		  if not specified then it calls getAttributes, othewise collect them and tries to guess the type
* @param {Object} attrs_info_example it overwrites the info about properties found in the object (in case the guessed type is wrong)
*/
Inspector.prototype.inspectInstance = function(instance, attrs, attrs_info_example, attributes_to_skip ) 
{
	if(!instance)
		return;

	if( !attrs && instance.getAttributes )
		attrs = instance.getAttributes();
	else
		attrs = this.collectAttributes(instance);

	var classObject = instance.constructor;
	if(!attrs_info_example && classObject.attributes)
		attrs_info_example = classObject.attributes;

	//clone to ensure there is no overlap between widgets reusing the same container
	var attrs_info = {};

	//add to attrs_info the ones that are not specified 
	for(var i in attrs)
	{
		if(attrs_info_example && attrs_info_example[i])
		{
			//clone
			attrs_info[i] = inner_clone( attrs_info_example[i] );
			continue;
		}

		var v = attrs[i];

		if(classObject["@" + i]) //in class object
		{
			var shared_options = classObject["@" + i];
			attrs_info[i] = inner_clone( shared_options );
			/*
			for(var j in shared_options) //clone, because cannot be shared or errors could appear
				options[j] = shared_options[j];
				attrs_info[i] = options;
			*/
		}
		else if(instance["@" + i])
			attrs_info[i] = instance["@" + i];
		else if (typeof(v) == "number")
			attrs_info[i] = { type: "number", step: 0.1 };
		else if (typeof(v) == "string")
			attrs_info[i] = { type: "string" };
		else if (typeof(v) == "boolean")
			attrs_info[i] = { type: "boolean" };
		else if( v && v.length )
		{
			switch(v.length)
			{
				case 2: attrs_info[i] = { type: "vec2", step: 0.1 }; break;
				case 3: attrs_info[i] = { type: "vec3", step: 0.1 }; break;
				case 4: attrs_info[i] = { type: "vec4", step: 0.1 }; break;
				default: continue;
			}
		}
	}

	if(attributes_to_skip)
		for(var i in attributes_to_skip)
			delete attrs_info[ attributes_to_skip[i] ];

	//showAttributes doesnt return anything but just in case...
	return this.showAttributes( instance, attrs_info );

	//basic cloner
	function inner_clone(original, target)
	{
		target = target || {};
		for(var j in original)
			target[j] = original[j];
		return target;
	}
}

/**  extract all attributes from an instance (enumerable properties that are not function and a name starting with alphabetic character)
*
* @method collectAttributes
**/
Inspector.prototype.collectAttributes = function(instance)
{
	var attrs = {};

	for(var i in instance)
	{
		if(i[0] == "_" || i[0] == "@" || i.substr(0,6) == "jQuery") //skip vars with _ (they are private)
			continue;

		var v = instance[i];
		if ( v && v.constructor == Function )
			continue;
		attrs[i] = v;
	}
	return attrs;
}

//adds the widgets for the attributes specified in attrs_info of instance
Inspector.prototype.showAttributes = function( instance, attrs_info ) 
{
	//for every enumerable property create widget
	for(var i in attrs_info)
	{
		var options = attrs_info[i];
		if(!options.callback)
		{
			var o = { instance: instance, name: i, options: options };
			options.callback = Inspector.assignValue.bind(o);

		}
		options.instance = instance;

		var type = options.type || options.widget || "string";

		//used to hook stuff on special occasions
		if( this.on_addAttribute )
			this.on_addAttribute( type, instance, i, instance[i], options );

		this.add( type, i, instance[i], options );
	}

	//extra widgets inserted by the object (stored in the constructor)
	if(instance.constructor.widgets)
		for(var i in instance.constructor.widgets)
		{
			var w = instance.constructor.widgets[i];
			this.add( w.widget, w.name, w.value, w );
		}

	//used to add extra widgets
	if(instance.onShowAttributes)
		instance.onShowAttributes(this);

	if(instance.constructor.onShowAttributes)
		instance.constructor.onShowAttributes(instance, this);
}

Inspector.assignValue = function(value)
{
	var instance = this.instance;
	var current_value = instance[this.name];

	if(current_value == null || value == null || this.options.type == "enum")
		instance[this.name] = value;
	else if(typeof(current_value) == "number")
		instance[this.name] = parseFloat(value);
	else if(typeof(current_value) == "string")
		instance[this.name] = value;
	else if(value && value.length && current_value && current_value.length)
	{
		for(var i = 0; i < value.length; ++i)
			current_value[i] = value[i];
	}
	else
		instance[this.name] = value;
}

Inspector.prototype.createWidget = function(name, content, options) 
{
	options = options || {};
	content = content || "";
	var element = document.createElement("DIV");
	element.className = "widget " + (options.className || "");
	element.inspector = this;
	element.options = options;
	element.name = name;

	var width = options.width || this.widgets_width;
	if(width)
	{
		element.style.width = typeof(width) == "string" ? width : width + "px";
		element.style.minWidth = element.style.width;
	}

	if(name)
		this.widgets[name] = element;

	if(this.widgets_per_row != 1)
	{
		if(!options.width)
			element.style.width = (100 / this.widgets_per_row).toFixed(2) + "%";
		element.style.display = "inline-block";
	}

	var namewidth = "";
	var contentwidth = "";
	if(name != null && (this.name_width || options.name_width) && !this.one_line)
	{
		var w = options.name_width || this.name_width;
		if(typeof(w) == "number") w = w.toFixed() + "px";
		namewidth = "style='width: calc(" + w + " - 0px); width: -webkit-calc(" + w + " - 0px); width: -moz-calc(" + w + " - 0px); '"; //hack 
		contentwidth = "style='width: calc( 100% - " + w + "); width: -webkit-calc(100% - " + w + "); width: -moz-calc( 100% - " + w + "); '";
	}

	var code = "";
	var pretitle = "";
	var filling = this.one_line ? "" : "<span class='filling'>....................</span>";

	if(options.pretitle)
		pretitle = options.pretitle;

	var content_class = "wcontent ";
	var title = name;
	if(options.title)
		title = options.title;
	if(name == null)
		content_class += " full";
	else if(name == "")
		code += "<span class='wname' title='"+title+"' "+namewidth+">"+ pretitle +"</span>";
	else
		code += "<span class='wname' title='"+title+"' "+namewidth+">"+ pretitle + name + filling + "</span>";

	if(typeof(content) == "string")
		element.innerHTML = code + "<span class='info_content "+content_class+"' "+contentwidth+">"+content+"</span>";
	else
	{
		element.innerHTML = code + "<span class='info_content "+content_class+"' "+contentwidth+"></span>";
		$(element).find("span.info_content").append(content);
	}

	return element;
}

//calls callback, triggers wchange, calls onchange in Inspector
Inspector.onWidgetChange = function(element, name, value, options, expand_value )
{
	this.values[name] = value;
	//LiteGUI.trigger( this.current_section, "wchange", value );
	$(this.current_section).trigger("wchange",value); //used for undo //TODO: REMOVE
	var r = undefined;
	if(options.callback)
	{
		if(expand_value)
			r = options.callback.apply( element, value );
		else
			r = options.callback.call( element, value );
	}

	//LiteGUI.trigger( element, "wchange", value );
	$(element).trigger("wchange",value); //TODO: REPLACE by LiteGUI.trigger
	if(this.onchange) 
		this.onchange(name, value, element);
	return r;
}

Inspector.widget_constructors = {
	title: 'addTitle',
	info: 'addInfo',
	number: 'addNumber',
	slider: 'addSlider',
	string: 'addString',
	text: 'addString',
	textarea: 'addTextarea',
	color: 'addColor',
	"boolean": 'addCheckbox', 
	checkbox: 'addCheckbox',
	icon: 'addIcon',
	vec2: 'addVector2',
	vector2: 'addVector2',
	vec3: 'addVector3',
	vector3: 'addVector3',
	vec4: 'addVector4',
	vector4: 'addVector4',
	"enum": 'addCombo',
	combo: 'addCombo',
	button: 'addButton',
	buttons: 'addButtons',
	file: 'addFile',
	line: 'addLine',
	list: 'addList',
	tree: 'addTree',
	datatree: 'addDataTree',
	separator: 'addSeparator'
};


Inspector.registerWidget = function(name, callback)
{
	var func_name = "add" + name.charAt(0).toUpperCase() + name.slice(1);
	Inspector.prototype[func_name] = callback;
	Inspector.widget_constructors[name] = func_name;
}

Inspector.prototype.add = function(type,name,value,options)
{
	if(typeof(type) == "object" && arguments.length == 1)
	{
		options = type;
		type = options.type;
		name = options.name;
		value = options.value;
	}

	var func = Inspector.widget_constructors[type];
	if(!func){
		console.warn("LiteGUI.Inspector do not have a widget called",type);
		return;
	}

	if(typeof(func) == "string")
		func = Inspector.prototype[func];
	if(!func) return;
	if(typeof(func) != "function") return;

	if(typeof(options) == 'function')
		options = { callback: options };
	
	return func.call(this, name,value, options);
}

Inspector.prototype.getValue = function(name)
{
	return this.values[name];
}

Inspector.prototype.set = function(name, value)
{
	//TODO
}

Inspector.prototype.addContainer = function(name, options)
{
	options = this.processOptions(options);

	var element = document.createElement("DIV");
	element.className = "wcontainer";
	if(options.className)
		element.className += " " + options.className;
	if(options.id)
		element.id = options.id;

	this.append( element );
	this.pushContainer( element );

	if(options.widgets_per_row)
		this.widgets_per_row = options.widgets_per_row;

	element.refresh = function()
	{
		if(element.on_refresh)
			element.on_refresh.call(this, element);
	}
	return element;
}

Inspector.prototype.endContainer = function(name, options)
{
	this.popContainer();
}


Inspector.prototype.addSection = function(name, options)
{
	if(this.current_group)
		this.endGroup();

	options = this.processOptions(options);

	var element = document.createElement("DIV");
	element.className = "wsection";
	if(!name) element.className += " notitle";
	if(options.className)
		element.className += " " + options.className;
	if(options.collapsed)
		element.className += " collapsed";

	if(options.id)
		element.id = options.id;
	if(options.instance)
		element.instance = options.instance;

	var code = "";
	if(name)
		code += "<div class='wsectiontitle'>"+(options.no_collapse ? "" : "<span class='switch-section-button'></span>")+name+"</div>";
	code += "<div class='wsectioncontent'></div>";
	element.innerHTML = code;
	this.root.appendChild(element);

	if(name)
		element.querySelector(".wsectiontitle").addEventListener("click",function(e) {
			if(e.target.localName == "button") 
				return;
			element.classList.toggle("collapsed");
			var seccont = element.querySelector(".wsectioncontent");
			seccont.style.display = seccont.style.display === "none" ? null : "none";
			if(options.callback)
				options.callback.call( element, !element.classList.contains("collapsed") );
		});

	if(options.collapsed)
		element.querySelector(".wsectioncontent").style.display = "none";

	this.setCurrentSection( element );

	if(options.widgets_per_row)
		this.widgets_per_row = options.widgets_per_row;

	element.refresh = function()
	{
		if(element.on_refresh)
			element.on_refresh.call(this, element);
	}

	return element;
}


Inspector.prototype.setCurrentSection = function(element)
{
	if(this.current_group)
		this.endGroup();

	this.current_section = element;
	this.current_section_content = element.querySelector(".wsectioncontent");
	this.content = this.current_section_content; //shortcut
}

Inspector.prototype.getCurrentSection = function()
{
	return this.current_section;
}

Inspector.prototype.beginGroup = function(name, options)
{
	options = this.processOptions(options);

	if(this.current_group)
		this.endGroup();

	var element = document.createElement("DIV");
	element.className = "wgroup";
	name = name || "";
	element.innerHTML = "<div class='wgroupheader "+ (options.title ? "wtitle" : "") +"'><span class='wgrouptoggle'>-</span>"+name+"</div>";

	var content = document.createElement("DIV");
	content.className = "wgroupcontent";
	if(options.collapsed)
		content.style.display = "none";

	element.appendChild( content );

	var collapsed = options.collapsed || false;
	element.querySelector(".wgroupheader").addEventListener("click", function() { 
		var style = element.querySelector(".wgroupcontent").style;
		style.display = style.display === "none" ? "" : "none";
		collapsed = !collapsed;
		element.querySelector(".wgrouptoggle").innerHTML = (collapsed ? "+" : "-");
	});

	this.append(element, options);

	this.current_group = element;
	this.current_group_content = content;
	this.content = this.current_group_content; //shortcut

	return element;
}

Inspector.prototype.endGroup = function(options)
{
	this.current_group = null;
	this.current_group_content = null;
	this.content = this.current_section_content; //shortcut
}

Inspector.prototype.addTitle = function(title,options)
{
	options = this.processOptions(options);

	var element = document.createElement("DIV");
	var code = "<span class='wtitle'><span class='text'>"+title+"</span>";
	if(options.help)
	{
		code += "<span class='help'><div class='help-content'>"+options.help+"</div></span>";
	}
	code += "</span>";
	element.innerHTML = code;

	element.setValue = function(v) { $(this).find(".text").html(v); };

	this.append(element, options);
	return element;
}

Inspector.prototype.addSeparator = function()
{
	var element = document.createElement("DIV");
	element.className = "separator";
	this.append(element);
	return element;
}

Inspector.prototype.addString = function(name,value, options)
{
	options = this.processOptions(options);

	value = value || "";
	var that = this;
	this.values[name] = value;

	var inputtype = "text";
	if(options.password) 
		inputtype = "password";
	var focus = options.focus ? "autofocus" : "";

	var element = this.createWidget(name,"<span class='inputfield full "+(options.disabled?"disabled":"")+"'><input type='"+inputtype+"' tabIndex='"+this.tab_index+"' "+focus+" class='text string' value='"+value+"' "+(options.disabled?"disabled":"")+"/></span>", options);
	var input = element.querySelector(".wcontent input");

	input.addEventListener( options.immediate ? "keyup" : "change", function(e) { 
		var r = Inspector.onWidgetChange.call(that, element, name, e.target.value, options);
		if(r !== undefined)
			this.value = r;
	});

	this.tab_index += 1;

	element.setValue = function(v) { 
		input.value = v; 
		LiteGUI.trigger(input, "change" );
	};
	element.getValue = function() { return input.value; };
	element.focus = function() { $(this).find("input").focus(); };
	element.wchange = function(callback) { $(this).wchange(callback); }
	this.append(element,options);
	return element;
}

Inspector.prototype.addStringButton = function(name,value, options)
{
	options = this.processOptions(options);

	value = value || "";
	var that = this;
	this.values[name] = value;
	
	var element = this.createWidget(name,"<span class='inputfield button'><input type='text' tabIndex='"+this.tab_index+"' class='text string' value='"+value+"' "+(options.disabled?"disabled":"")+"/></span><button class='micro'>"+(options.button || "...")+"</button>", options);
	var input = element.querySelector(".wcontent input");
	input.addEventListener("change", function(e) { 
		var r = Inspector.onWidgetChange.call(that,element,name,e.target.value, options);
		if(r !== undefined)
			this.value = r;
	});
	
	var button = element.querySelector(".wcontent button");
	button.addEventListener("click", function(e) { 
		if(options.callback_button)
			options.callback_button.call(element, input.value );
	});

	this.tab_index += 1;
	this.append(element,options);
	element.wchange = function(callback) { $(this).wchange(callback); }
	element.wclick = function(callback) { $(this).wclick(callback); }
	element.setValue = function(v) { input.value = v; LiteGUI.trigger(input, "change" ); };
	element.getValue = function() { return input.value; };
	element.focus = function() { $(this).find("input").focus(); };
	return element;
}

Inspector.prototype.addNumber = function(name, value, options)
{
	options = this.processOptions(options);

	if(!options.step)
		options.step = 0.1;

	value = value || 0;
	var that = this;
	this.values[name] = value;

	var element = this.createWidget(name,"", options);
	this.append(element,options);

	options.extraclass = "full";
	options.tab_index = this.tab_index;
	//options.dragger_class = "full";
	options.full = true;
	this.tab_index++;

	var dragger = new LiteGUI.Dragger(value, options);
	dragger.root.style.width = "calc( 100% - 1px )";
	element.querySelector(".wcontent").appendChild( dragger.root );
	$(dragger.root).bind("start_dragging", inner_before_change.bind(options) );

	function inner_before_change(e)
	{
		if(this.callback_before) 
			this.callback_before.call(element);
	}

	var input = element.querySelector("input");
	
	$(input).change( function(e) { 
		that.values[name] = e.target.value;
		//Inspector.onWidgetChange.call(that,this,name,ret, options);

		if(options.callback)
		{
			var ret = options.callback.call(element, parseFloat( e.target.value) ); 
			if( typeof(ret) == "number")
				this.value = ret;
		}
		$(element).trigger("wchange",e.target.value);
		if(that.onchange) that.onchange(name,e.target.value,element);
	});

	element.setValue = function(v) { 
		v = parseFloat(v);
		if(options.precision)
			v = v.toFixed( options.precision );
		input.value = v + (options.units || "");
		LiteGUI.trigger( input,"change" );
	};

	element.getValue = function() { return parseFloat( input.value ); };
	element.focus = function() { $(input).focus(); };

	return element;
}

Inspector.prototype.addVector2 = function(name,value, options)
{
	options = this.processOptions(options);
	if(!options.step)
		options.step = 0.1;

	value = value || [0,0];
	var that = this;
	this.values[name] = value;
	
	var element = this.createWidget(name,"", options);

	options.step = options.step ||0.1;
	//options.dragger_class = "medium";
	options.tab_index = this.tab_index;
	options.full = true;
	this.tab_index++;

	var wcontent = element.querySelector(".wcontent");

	var dragger1 = new LiteGUI.Dragger(value[0], options);
	dragger1.root.style.marginLeft = 0;
	dragger1.root.style.width = "calc( 50% - 1px )";
	wcontent.appendChild( dragger1.root );

	options.tab_index = this.tab_index;
	this.tab_index++;

	var dragger2 = new LiteGUI.Dragger(value[1], options);
	dragger2.root.style.width = "calc( 50% - 1px )";
	wcontent.appendChild( dragger2.root );

	$(dragger1.root).bind("start_dragging",inner_before_change.bind(options) );
	$(dragger2.root).bind("start_dragging",inner_before_change.bind(options) );

	function inner_before_change(e)
	{
		if(this.callback_before) this.callback_before(e);
	}

	//ALL INPUTS
	$(element).find("input").change( function(e) { 
		//gather all three parameters
		var r = [];
		var elems = $(element).find("input");
		for(var i = 0; i < elems.length; i++)
			r.push( parseFloat( elems[i].value ) );

		that.values[name] = r;

		if(options.callback)
		{
			var new_val = options.callback.call(element,r); 
			
			if(typeof(new_val) == "object" && new_val.length >= 2)
			{
				for(var i = 0; i < elems.length; i++)
					$(elems[i]).val(new_val[i]);
				r = new_val;
			}
		}

		$(element).trigger("wchange",[r]);
		if(that.onchange) that.onchange(name,r,element);
	});

	this.append(element,options);

	element.setValue = function(v) { 
		dragger1.setValue(v[0]);
		dragger2.setValue(v[1]);
	}

	return element;
}

Inspector.prototype.addVector3 = function(name,value, options)
{
	options = this.processOptions(options);
	if(!options.step)
		options.step = 0.1;

	value = value || [0,0,0];
	var that = this;
	this.values[name] = value;
	
	var element = this.createWidget(name,"", options);

	options.step = options.step || 0.1;
	//options.dragger_class = "mini";
	options.tab_index = this.tab_index;
	options.full = true;
	this.tab_index++;

	var dragger1 = new LiteGUI.Dragger(value[0], options );
	dragger1.root.style.marginLeft = 0;
	dragger1.root.style.width = "calc( 33% - 1px )";
	$(element).find(".wcontent").append(dragger1.root);

	options.tab_index = this.tab_index;
	this.tab_index++;

	var dragger2 = new LiteGUI.Dragger(value[1], options );
	dragger2.root.style.width = "calc( 33% - 1px )";
	$(element).find(".wcontent").append(dragger2.root);

	options.tab_index = this.tab_index;
	this.tab_index++;

	var dragger3 = new LiteGUI.Dragger(value[2], options );
	dragger3.root.style.width = "calc( 33% - 1px )";
	$(element).find(".wcontent").append(dragger3.root);

	$(dragger1.root).bind("start_dragging", inner_before_change.bind(options) );
	$(dragger2.root).bind("start_dragging", inner_before_change.bind(options) );
	$(dragger3.root).bind("start_dragging", inner_before_change.bind(options) );

	function inner_before_change(e)
	{
		if(this.callback_before) this.callback_before();
	}

	$(element).find("input").change( function(e) { 
		//gather all three parameters
		var r = [];
		var elems = $(element).find("input");
		for(var i = 0; i < elems.length; i++)
			r.push( parseFloat( elems[i].value ) );

		that.values[name] = r;

		if(options.callback)
		{
			var new_val = options.callback.call(element,r); 
			
			if(typeof(new_val) == "object" && new_val.length >= 3)
			{
				for(var i = 0; i < elems.length; i++)
					$(elems[i]).val(new_val[i]);
				r = new_val;
			}
		}

		$(element).trigger("wchange",[r]);
		if(that.onchange) that.onchange(name,r,element);
	});

	this.append(element,options);

	element.setValue = function(v) { 
		dragger1.setValue(v[0]);
		dragger2.setValue(v[1]);
		dragger3.setValue(v[2]);
	}
	return element;
}

Inspector.prototype.addVector4 = function(name,value, options)
{
	options = this.processOptions(options);
	if(!options.step)
		options.step = 0.1;

	value = value || [0,0,0];
	var that = this;
	this.values[name] = value;
	
	var element = this.createWidget(name,"", options);

	options.step = options.step || 0.1;
	//options.dragger_class = "mini";
	options.tab_index = this.tab_index;
	options.full = true;
	this.tab_index++;

	var draggers = [];

	for(var i = 0; i < 4; i++)
	{
		var dragger = new LiteGUI.Dragger(value[i], options );
		dragger.root.style.marginLeft = 0;
		dragger.root.style.width = "calc( 25% - 1px )";
		$(element).find(".wcontent").append(dragger.root);
		options.tab_index = this.tab_index;
		this.tab_index++;
		$(dragger.root).bind("start_dragging", inner_before_change.bind(options) );
		draggers.push(dragger);
	}

	function inner_before_change(e)
	{
		if(this.callback_before) this.callback_before();
	}

	$(element).find("input").change( function(e) { 
		//gather all parameters
		var r = [];
		var elems = $(element).find("input");
		for(var i = 0; i < elems.length; i++)
			r.push( parseFloat( elems[i].value ) );

		that.values[name] = r;

		if(options.callback)
		{
			var new_val = options.callback.call(element,r); 
			if(typeof(new_val) == "object" && new_val.length >= 4)
			{
				for(var i = 0; i < elems.length; i++)
					$(elems[i]).val(new_val[i]);
				r = new_val;
			}
		}

		$(element).trigger("wchange",[r]);
		if(that.onchange) that.onchange(name,r,element);
	});

	this.append(element,options);

	element.setValue = function(v) { 
		for(var i = 0; i < draggers.length; i++)
			draggers[i].setValue(v[i]);
	}
	return element;
}

Inspector.prototype.addTextarea = function(name,value, options)
{
	options = this.processOptions(options);

	value = value || "";
	var that = this;
	this.values[name] = value;
	;

	var element = this.createWidget(name,"<span class='inputfield textarea "+(options.disabled?"disabled":"")+"'><textarea tabIndex='"+this.tab_index+"' "+(options.disabled?"disabled":"")+">"+value+"</textarea></span>", options);
	this.tab_index++;

	element.querySelector(".wcontent textarea").addEventListener( options.immediate ? "keyup" : "change", function(e) { 
		Inspector.onWidgetChange.call(that,element,name,e.target.value, options);
	});

	if(options.height)
		$(element).find("textarea").css({height: options.height });
	this.append(element,options);

	element.setValue = function(v) { $(this).find("textarea").val(v).change(); };
	return element;
}

Inspector.prototype.addInfo = function(name,value, options)
{
	options = this.processOptions(options);

	value = value || "";
	var element = null;
	if(name != null)
		element = this.createWidget(name,value, options);
	else
	{
		element = document.createElement("div");
		if(options.className)
			element.className = options.className;
		if(value.nodeName !== undefined)
		{
			element.innerHTML = "<span class='winfo'></span>";
			element.childNodes[0].appendChild( value );
		}
		else
			element.innerHTML = "<span class='winfo'>"+value+"</span>";
	}

	var info = element.querySelector(".winfo");

	element.setValue = function(v) { info.innerHTML = v; };

	if(options.height)
	{
		var content = element.querySelector("span.info_content");
		content.style.height = typeof(options.height) == "string" ? options.height : options.height + "px";
		content.style.overflow = "auto";
	}

	this.append(element,options);
	return element;
}

Inspector.prototype.addSlider = function(name, value, options)
{
	options = this.processOptions(options);

	if(options.min === undefined)
		options.min = 0;

	if(options.max === undefined)
		options.max = 1;

	if(options.step === undefined)
		options.step = 0.01;

	var that = this;
	this.values[name] = value;

	var element = this.createWidget(name,"<span class='inputfield full'>\
				<input tabIndex='"+this.tab_index+"' type='text' class='slider-text fixed nano' value='"+value+"' /><span class='slider-container'></span></span>", options);

	var slider_container = element.querySelector(".slider-container");

	var slider = new LiteGUI.Slider(value,options);
	slider_container.appendChild(slider.root);

	var skip_change = false; //used to avoid recursive loops
	var text_input = element.querySelector(".slider-text");
	$(text_input).on('change', function() {
		if(skip_change) return;

		var v = parseFloat( $(this).val() );
		/*
		if(v > options.max)
		{
			skip_change = true;
			slider.setValue( options.max );
			skip_change = false;
		}
		else
		*/
		slider.setValue( v );

		Inspector.onWidgetChange.call(that,element,name,v, options);
	});

	$(slider.root).on("change", function(e,v) {
		text_input.value = v;
		Inspector.onWidgetChange.call(that,element,name,v, options);
	});

	
	/*
	//var element = this.createWidget(name,"<span class='inputfield'><input tabIndex='"+this.tab_index+"' type='text' class='fixed nano' value='"+value+"' /></span><div class='wslider'></div>", options);
	var element = this.createWidget(name,"<span class='inputfield'>\
				<input tabIndex='"+this.tab_index+"' type='text' class='slider-text fixed nano' value='"+value+"' /></span>\
				<span class='ui-slider'>\
				<input class='slider-input' type='range' step='"+options.step+"' min='"+ options.min +"' max='"+ options.max +"'/><span class='slider-thumb'></span></span>", options);

	this.tab_index++;

	var text_input = $(element).find(".slider-text");
	var slider_input = $(element).find(".slider-input");
	var slider_thumb = $(element).find(".slider-thumb");

	slider_input.bind('input', inner_slider_move );

	var skip_change = false; //used to avoid recursive loops
	text_input.bind('change', function() {
		if(skip_change) return;

		var v = parseFloat( $(this).val() );
		if(v > options.max)
		{
			skip_change = true;
			slider_input.val( options.max );
			skip_change = false;
		}
		else
			slider_input.val(v);

		var vnormalized = (v - options.min) / (options.max - options.min);
		if(vnormalized > 1) vnormalized = 1;
		else if(vnormalized < 0) vnormalized = 0;

		slider_thumb.css({left: (vnormalized * ($(slider_input).width() - 12)) });
		Inspector.onWidgetChange.call(that,element,name,v, options);
	});

	function inner_slider_move(e)
	{
		var v = parseFloat( e.target.value );
		var vnormalized = (v - options.min) / (options.max - options.min);
		if(!skip_change)
		{
			text_input.val(v);
			Inspector.onWidgetChange.call(that,element,name,v, options);
		}
		slider_thumb.css({left: (vnormalized * 90).toFixed(2) + "%" });
	}

	*/

	this.append(element,options);
	element.setValue = function(v) { slider.setValue(v); };
	//skip_change = true;
	//slider_input.val(value).trigger("input");
	//skip_change = false;
	return element;
}


Inspector.prototype.addCheckbox = function(name, value, options)
{
	options = this.processOptions(options);

	value = value || "";
	var that = this;
	this.values[name] = value;

	var label_on = options.label_on || options.label || "on";
	var label_off = options.label_off || options.label || "off";
	var label = (value ? label_on : label_off);
	
	//var element = this.createWidget(name,"<span class='inputfield'><span class='fixed flag'>"+(value ? "on" : "off")+"</span><span tabIndex='"+this.tab_index+"'class='checkbox "+(value?"on":"")+"'></span></span>", options );
	var element = this.createWidget(name,"<span class='inputfield'><span tabIndex='"+this.tab_index+"' class='fixed flag checkbox "+(value ? "on" : "off")+"'>"+label+"</span></span>", options );
	this.tab_index++;

	var checkbox = element.querySelector(".wcontent .checkbox");
	checkbox.addEventListener("keypress", function(e) { 
		if(e.keyCode == 32)
			LiteGUI.trigger(this, "click");
	});

	element.addEventListener("click", function() {
		var v = !this.data;
		this.data = v;
		element.querySelector("span.flag").innerHTML = v ? label_on : label_off;
		if(v)
			checkbox.classList.add("on");
		else
			checkbox.classList.remove("on");
		Inspector.onWidgetChange.call(that,element,name,v, options);
	});
	
	element.data = value;

	element.setValue = function(v) { 
		if(	that.values[name] != v)
			LiteGUI.trigger( checkbox, "click" ); 
	};

	this.append(element,options);
	return element;
}

Inspector.prototype.addFlags = function(flags, force_flags)
{
	var f = {};
	for(var i in flags)
		f[i] = flags[i];
	if(force_flags)
		for(var i in force_flags)
			if( typeof(f[i]) == "undefined" )
				f[i] = ( force_flags[i] ? true : false );

	for(var i in f)
	{
		this.addCheckbox(i, f[i], { callback: (function(j) {
			return function(v) { 
				flags[j] = v;
			}
		})(i)
		});
	}
}

Inspector.prototype.addCombo = function(name, value, options)
{
	options = this.processOptions(options);

	//value = value || "";
	var that = this;
	this.values[name] = value;
	
	var code = "<select tabIndex='"+this.tab_index+"' "+(options.disabled?"disabled":"")+" class='"+(options.disabled?"disabled":"")+"'>";
	this.tab_index++;

	var element = this.createWidget(name,"<span class='inputfield full inputcombo "+(options.disabled?"disabled":"")+"'></span>", options);
	element.options = options;

	var values = options.values || [];

	if(options.values)
	{
		if (typeof(values) == "function")
			values = options.values();
		else
			values = options.values;
		if(values) 
			for(var i in values)
			{
				var item_value = values[i];
				code += "<option data-value='" + item_value + "' "+( item_value == value ? " selected":"")+">" + ( values.length ? item_value : i) + "</option>";
			}
	}
	code += "</select>";

	element.querySelector("span.inputcombo").innerHTML = code;

	$(element).find(".wcontent select").change( function(e) { 
		var value = e.target.value;
		if(values && values.constructor != Array)
			value = values[value];
		Inspector.onWidgetChange.call(that,element,name,value, options);
	});

	element.setValue = function(v) { 
		var select = element.querySelector("select");
		var items = select.querySelectorAll("option");
		var index = 0;
		for(var i in items)
		{
			var item = items[i];
			if(!item || !item.dataset) //weird bug
				continue;
			if( item.dataset["value"] == v )
			{
				select.selectedIndex = index;
				return;
			}
			index++;
		}
	};

	this.append(element,options);
	return element;
}

Inspector.prototype.addComboButtons = function(name, value, options)
{
	options = this.processOptions(options);

	value = value || "";
	var that = this;
	this.values[name] = value;
	
	var code = "";
	if(options.values)
		for(var i in options.values)
			code += "<button class='wcombobutton "+(value == options.values[i] ? "selected":"")+"' data-name='options.values[i]'>" + options.values[i] + "</button>";

	var element = this.createWidget(name,code, options);
	$(element).find(".wcontent button").click( function(e) { 

		var buttonname = e.target.innerHTML;
		that.values[name] = buttonname;

		$(element).find(".selected").removeClass("selected");
		$(this).addClass("selected");

		Inspector.onWidgetChange.call(that,element,name,buttonname, options);
	});

	this.append(element,options);
	return element;
}

Inspector.prototype.addTags = function(name, value, options)
{
	options = this.processOptions(options);

	value = value || [];
	var that = this;
	this.values[name] = value;
	
	var code = "<select>";
	if(options.values)
		for(var i in options.values)
			code += "<option>" + options.values[i] + "</option>";

	code += "</select><div class='wtagscontainer inputfield'></div>";

	var element = this.createWidget(name,"<span class='inputfield full'>"+code+"</span>", options);
	element.tags = {};

	//add default tags
	for(var i in options.value)
		inner_addtag(options.value[i]);

	//combo change
	$(element).find(".wcontent select").change( function(e) { 
		inner_addtag(e.target.value);
	});

	function inner_addtag(tagname)
	{
		if( element.tags[tagname] )
			return; //repeated tags no

		element.tags[tagname] = true;

		var tag = document.createElement("div");
		tag.data = tagname;
		tag.className = "wtag";
		tag.innerHTML = tagname+"<span class='close'>X</span>";

		tag.querySelector(".close").addEventListener("click", function(e) {
			var tagname = $(this).parent()[0].data;
			delete element.tags[tagname];
			$(this).parent().remove();
			$(element).trigger("wremoved", tagname );
			Inspector.onWidgetChange.call(that,element,name,element.tags, options);
		});

		element.querySelector(".wtagscontainer").appendChild(tag);

		that.values[name] = element.tags;
		if(options.callback) options.callback.call(element,element.tags); 
		$(element).trigger("wchange",element.tags);
		$(element).trigger("wadded",tagname);
		if(that.onchange) that.onchange(name, element.tags, element);
	}

	this.append(element,options);
	return element;
}

Inspector.prototype.addList = function(name, values, options)
{
	options = this.processOptions(options);

	var that = this;
	
	var height = "";
	if(options.height)
		height = "style='height: "+options.height+"px; overflow: auto;'";

	var code = "<ul class='lite-list' "+height+" tabIndex='"+this.tab_index+"'><ul>";
	this.tab_index++;

	var element = this.createWidget(name,"<span class='inputfield full "+(options.disabled?"disabled":"")+"'>"+code+"</span>", options);

	$(element).find("ul").focus(function() {
		$(document).on("keypress",inner_key);
	});

	$(element).find("ul").blur(function() {
		$(document).off("keypress",inner_key);
	});

	function inner_key(e)
	{
		var selected = $(element).find("li.selected");
		if(!selected || !selected.length) return;

		if(e.keyCode == 40)
		{
			var next = selected.next();
			if(next && next.length)
				$(next[0]).click();
		}
		else if(e.keyCode == 38)
		{
			var prev = selected.prev();
			if(prev && prev.length)
				$(prev[0]).click();
		}
	}

	function inner_item_click(e) { 

		if(options.multiselection)
			$(this).toggleClass("selected");
		else
		{
			//batch action, jquery...
			$(element).find("li").removeClass("selected");
			$(this).addClass("selected");
		}

		var value = values[ this.dataset["pos"] ];
		//if(options.callback) options.callback.call(element,value); //done in onWidgetChange
		Inspector.onWidgetChange.call(that,element,name,value, options);
		$(element).trigger("wadded",value);
	}

	element.updateItems = function(new_values)
	{
		var code = "";
		values = new_values;
		if(values)
			for(var i in values)
			{
				var item_name = values[i]; //array

				var icon = "";
				if(	values[i].length == null ) //object
				{
					item_name = values[i].name ? values[i].name : i;
					if(values[i].icon)
						icon = "<img src='"+values[i].icon+"' class='icon' />";
				}

				code += "<li className='item-"+i+" "+(typeof(values[i]) == "object" && values[i].selected ? "selected":"") + "' data-name='"+item_name+"' data-pos='"+i+"'>" + icon + item_name + "</li>";
			}

		this.querySelector("ul").innerHTML = code;
		$(this).find(".wcontent li").click( inner_item_click );
	}

	element.removeItem = function(name)
	{
		var items = $(element).find(".wcontent li");
		for(var i = 0; i < items.length; i++)
		{
			if(items[i].dataset["name"] == name)
				LiteGUI.remove( items[i] );
		}
	}

	element.updateItems(values);
	this.append(element,options);

	element.getSelected = function()
	{
		var r = [];
		var selected = this.querySelectorAll("ul li.selected");
		for(var i = 0; i < selected.length; ++i)
			r.push( selected[i].dataset["name"] );
		return r;
	}

	element.getIndex = function(num)
	{
		var items = this.querySelectorAll("ul li");
		return items[num];
	}

	element.selectIndex = function(num)
	{
		var items = this.querySelectorAll("ul li");
		for(var i = 0; i < items.length; ++i)
		{
			var item = items[i];
			if(i == num)
				item.classList.add("selected");
			else
				item.classList.remove("selected");
		}
		return items[num];
	}

	element.scrollToIndex = function(num)
	{
		var items = this.querySelectorAll("ul li");
		var item = items[num];
		if(!item)
			return;
		this.scrollTop = item.offsetTop;
	}

	element.selectAll = function()
	{
		var items = this.querySelectorAll("ul li");
		for(var i = 0; i < items.length; ++i)
		{
			var item = items[i];
			if( item.classList.contains("selected") )
				continue;
			//$(item).click();
			LiteGUI.trigger( item, "click" );
		}
	}

	element.setValue = function(v)
	{
		this.updateItems(v);
	}

	if(options.height) 
		$(element).scroll(0);
	return element;
}

Inspector.prototype.addButton = function(name, value, options)
{
	options = this.processOptions(options);

	value = value || "";
	var that = this;

	var c = "";
	if(name === null)
		c = "single";
	
	var element = this.createWidget(name,"<button class='"+c+"' tabIndex='"+ this.tab_index + "'>"+value+"</button>", options);
	this.tab_index++;
	var button = element.querySelector("button");
	button.addEventListener("click", function() {
		Inspector.onWidgetChange.call(that,element,name,this.innerHTML, options);
		LiteGUI.trigger( button, "wclick", value );
	});
	this.append(element,options);

	element.wclick = function(callback) { 
		if(!options.disabled)
			$(this).wclick(callback); 
	}
	return element;
}

Inspector.prototype.addButtons = function(name, value, options)
{
	options = this.processOptions(options);

	value = value || "";
	var that = this;

	var code = "";
	var w = "calc("+(100/value.length).toFixed(3)+"% - "+Math.floor(16/value.length)+"px);";
	if(value && typeof(value) == "object")
	{
		for(var i in value)
		{
			code += "<button tabIndex='"+this.tab_index+"' style=' width:"+w+" width: -moz-"+w+" width: -webkit-calc("+(89/value.length).toFixed(3)+"%)'>"+value[i]+"</button>";
			this.tab_index++;
		}
	}
	var element = this.createWidget(name,code, options);
	var buttons = element.querySelectorAll("button");
	for(var i = 0; i < buttons.length; ++i)
	{
		var button = buttons[i];
		button.addEventListener("click", function() {
			Inspector.onWidgetChange.call(that,element,name,this.innerHTML, options);
			LiteGUI.trigger( element, "wclick",this.innerHTML );
		});
	}

	this.append(element,options);
	return element;
}

Inspector.prototype.addIcon = function(name, value, options)
{
	options = this.processOptions(options);

	value = value || "";
	var that = this;

	var img_url = options.image;
	var width = options.width || options.size || 20;
	var height = options.height || options.size || 20;

	var element = this.createWidget(name,"<span class='icon' "+(options.title ? "title='"+options.title+"'" : "" )+" tabIndex='"+ this.tab_index + "'></span>", options);
	this.tab_index++;
	var content = element.querySelector("span.wcontent");
	var icon = element.querySelector("span.icon");

	var x = options.x || 0;
	if(options.index)
		x = options.index * -width;
	var y = value ? height : 0;

	element.style.minWidth = element.style.width = (width) + "px";
	element.style.margin = "0 2px"; element.style.padding = "0";
	content.style.margin = "0"; content.style.padding = "0";

	icon.style.display = "inline-block"
	icon.style.cursor = "pointer";
	icon.style.width = width + "px";
	icon.style.height = height + "px";
	icon.style.backgroundImage = "url('"+img_url+"')";
	icon.style.backgroundPosition = x + "px " + y + "px";

	icon.addEventListener("mousedown", function(e) {
		e.preventDefault();
		value = !value;
		var ret = Inspector.onWidgetChange.call(that,element,name, value, options);
		LiteGUI.trigger( element, "wclick", value);

		if(ret !== undefined)
			value = ret;

		var y = value ? height : 0;
		icon.style.backgroundPosition = x + "px " + y + "px";

		if(options.toggle === false) //blink
			setTimeout( function(){ icon.style.backgroundPosition = x + "px 0px"; value = false; },200 );

	});
	this.append(element,options);

	element.setValue = function(v, skip_event ) { 
		value = v;
		var y = value ? height : 0;
		icon.style.backgroundPosition = x + "px " + y + "px";
		if(!skip_event)
			Inspector.onWidgetChange.call(that,element,name, value, options);
	};
	element.getValue = function() { return value; };

	return element;
}

Inspector.prototype.addColor = function(name,value,options)
{
	options = this.processOptions(options);

	value = value || [0.0,0.0,0.0];
	var that = this;
	this.values[name] = value;
	
	var code = "<input tabIndex='"+this.tab_index+"' id='colorpicker-"+name+"' class='color' value='"+(value[0]+","+value[1]+","+value[2])+"' "+(options.disabled?"disabled":"")+"/>";
	this.tab_index++;

	if(options.show_rgb)
		code += "<span class='rgb-color'>"+Inspector.parseColor(value)+"</span>";
	var element = this.createWidget(name,code, options);
	this.append(element,options); //add now or jscolor dont work

	//create jsColor 
	var input_element = $(element).find("input.color")[0];
	var myColor = new jscolor.color(input_element);
	myColor.pickerFaceColor = "#333";
	myColor.pickerBorderColor = "black";
	myColor.pickerInsetColor = "#222";
	myColor.rgb_intensity = 1.0;

	if(options.disabled) 
		myColor.pickerOnfocus = false; //this doesnt work

	if(typeof(value) != "string" && value.length && value.length > 2)
	{
		var intensity = 1.0;
		myColor.fromRGB(value[0]*intensity,value[1]*intensity,value[2]*intensity);
		myColor.rgb_intensity = intensity;
	}

	//update values in rgb format
	input_element.addEventListener("change", function(e) { 
		var rgbelement = element.querySelector(".rgb-color");
		if(rgbelement)
			rgbelement.innerHTML = LiteGUI.Inspector.parseColor(myColor.rgb);
	});

	myColor.onImmediateChange = function() 
	{
		var v = [ myColor.rgb[0] * myColor.rgb_intensity, myColor.rgb[1] * myColor.rgb_intensity, myColor.rgb[2] * myColor.rgb_intensity ];
		//Inspector.onWidgetChange.call(that,element,name,v, options);

		that.values[name] = v;
		if(options.callback)
			options.callback.call(element, v.concat(), "#" + myColor.toString(), myColor);
		$(element).trigger("wchange",[v.concat(), myColor.toString()]);
		if(that.onchange) that.onchange(name, v.concat(), element);
	}

	//alpha dragger
	options.step = options.step || 0.01;
	options.dragger_class = "nano";

	var dragger = new LiteGUI.Dragger(1, options);
	$(element).find('.wcontent').append(dragger.root);
	$(dragger.input).change(function()
	{
		var v = parseFloat($(this).val());
		myColor.rgb_intensity = v;
		if (myColor.onImmediateChange)
			myColor.onImmediateChange();
	});

	element.setValue = function(value) { 
		myColor.fromRGB(value[0],value[1],value[2]);
		$(dragger.input).change(); 
	};

	return element;
}

Inspector.prototype.addFile = function(name, value, options)
{
	options = this.processOptions(options);

	value = value || "";
	var that = this;
	this.values[name] = value;
	
	var element = this.createWidget(name,"<span class='inputfield full whidden'><span class='filename'>"+value+"</span><input type='file' size='100' class='file' value='"+value+"'/></span>", options);
	var input = element.querySelector(".wcontent input");
	input.addEventListener("change", function(e) { 
		if(!e.target.files.length)
		{
			$(element).find(".filename").html("");
			Inspector.onWidgetChange.call(that, element, name, null, options);
			return;
		}

		var url = null;
		if( options.generate_url )
			url = URL.createObjectURL( e.target.files[0] );
		var data = { url: url, filename: e.target.value, file: e.target.files[0], files: e.target.files };
		$(element).find(".filename").html( e.target.value );
		Inspector.onWidgetChange.call(that, element, name, data, options);
	});

	this.append(element,options);
	return element;
}

Inspector.prototype.addLine = function(name, value, options)
{
	options = this.processOptions(options);

	value = value || "";
	var that = this;
	this.values[name] = value;
	
	var element = this.createWidget(name,"<span class='line-editor'></span>", options);

	var line_editor = new LiteGUI.LineEditor(value,options);
	$(element).find("span.line-editor").append(line_editor);

	$(line_editor).change( function(e) { 
		if(options.callback) options.callback.call(element,e.target.value);
		$(element).trigger("wchange",[e.target.value]);
		Inspector.onWidgetChange.call(that,element,name,e.target.value, options);
	});

	this.append(element,options);
	return element;
}

Inspector.prototype.addTree = function(name, value, options)
{
	options = this.processOptions(options);

	value = value || "";
	var element = this.createWidget(name,"<div class='wtree inputfield full'></div>", options);
	
	var tree_root = $(element).find(".wtree")[0];
	if(options.height)
	{
		tree_root.style.height = typeof(options.height) == "number" ? options.height + "px" : options.height;
		tree_root.style.overflow = "auto";
	}

	var current = value;

	var tree = element.tree = new LiteGUI.Tree(null,value, options.tree_options);
	tree.onItemSelected = function(node, data) {
		if(options.callback)
			options.callback(node,data);
	};

	tree_root.appendChild(tree.root);

	element.setValue = function(v) { 
		tree.updateTree(v);
	};

	this.append(element,options);
	return element;
}

Inspector.prototype.addDataTree = function(name, value, options)
{
	options = this.processOptions(options);

	value = value || "";
	var element = this.createWidget(name,"<div class='wtree'></div>", options);
	
	var node = $(element).find(".wtree")[0];
	var current = value;

	inner_recursive(node,value);

	function inner_recursive(root_node, value)
	{
		for(var i in value)
		{
			var e = document.createElement("div");
			e.className = "treenode";
			if( typeof( value[i] ) == "object" )
			{
				e.innerHTML = "<span class='itemname'>" + i + "</span><span class='itemcontent'></span>";
				inner_recursive($(e).find(".itemcontent")[0], value[i] );
			}
			else
				e.innerHTML = "<span class='itemname'>" + i + "</span><span class='itemvalue'>" + value[i] + "</span>";
			root_node.appendChild(e);
		}
	}

	this.append(element,options);
	return element;
}

Inspector.prototype.scrollTo = function( id )
{
	var element = this.root.querySelector("#" + id );
	if(!element)
		return;
	var top = this.root.offsetTop;
	var delta = element.offsetTop - top;
	this.root.parentNode.parentNode.scrollTop = delta;
}

/*
Inspector.prototype.addImageSlot = function(title, callback_drop, callback_set)
{
	var element = this.createElement("DIV");
	element.innerHTML = "<strong>"+title+"</strong><input class='text' type='text' value=''/><button class='load confirm_button'>Ok</button><div class='img-slot'>Drop img here</div>";
	this.append(element);

	var confirm_button = $(element).find(".confirm_button")[0];
	$(confirm_button).click(function() {
		var text = $(element).find(".text")[0];
		if(callback_set)
			callback_set( $(text).val() );
	});

	var slot = $(element).find(".img-slot")[0];

	slot.addEventListener("dragenter", onDragEnter, false);
	slot.addEventListener("dragexit", onDragExit, false);
	slot.addEventListener("dragover", onDragNull, false);
	slot.addEventListener("drop", onFileDrop, false);


	function onDragEnter(evt)
	{
		$(slot).addClass("highlight");
		evt.stopPropagation();
		evt.preventDefault();
	}

	function onDragExit(evt)
	{
		$(slot).removeClass("highlight");
		evt.stopPropagation();
		evt.preventDefault();
	}

	function onDragNull(evt)
	{
		evt.stopPropagation();
		evt.preventDefault();
	}

	function onFileDrop(evt)
	{
		$(slot).removeClass("highlight");
		evt.stopPropagation();
		evt.preventDefault();

		var files = evt.dataTransfer.files;
		var count = files.length;
		
		var file = files[0];
		if(file == null) return;

		var reader = new FileReader();
		var extension = file.name.substr( file.name.lastIndexOf(".") + 1).toLowerCase();

		reader.onload = function(e) {
			if(callback_drop)
				callback_drop(e, file);
		}

		var image_extensions = ["png","jpg"];
		if (image_extensions.indexOf(extension) != -1)
			reader.readAsDataURL(file);
		else
			reader.readAsArrayBuffer(file);
	}
}
*/


Inspector.prototype.processOptions = function(options)
{
	if(typeof(options) == "function")
		options = { callback: options };
	return options || {};
}

Inspector.parseColor = function(color)
{
	return "<span style='color: #FAA'>" + color[0].toFixed(2) + "</span>,<span style='color: #AFA'>" + color[1].toFixed(2) + "</span>,<span style='color: #AAF'>" + color[2].toFixed(2) + "</span>";
}

LiteGUI.Inspector = Inspector;
